"""Hash-chained policy lifecycle provenance events.

The in-process lock supports the single-process SQLite development environment.
Production multi-worker writes require DB-level serialization and externally
anchored checkpoints; the HTTP API refuses production startup meanwhile.
"""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import PolicyLifecycleEvent

GENESIS_HASH = "0" * 64
POLICY_LIFECYCLE_WRITE_LOCK = threading.RLock()


def _utc_iso(value: datetime) -> str:
    """Normalizes any datetime to a UTC ISO-8601 string with microsecond precision."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _canonical_json(value: Any) -> str:
    """Deterministically serializes dictionaries for SHA-256 hashing."""
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def _event_payload(
    *,
    tenant_id: str,
    event_type: str,
    policy_key: str,
    policy_version: int,
    actor_key_id: str,
    details: dict[str, Any],
    occurred_at: datetime,
) -> dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "event_type": event_type,
        "policy_key": policy_key,
        "policy_version": policy_version,
        "actor_key_id": actor_key_id,
        "details": details,
        "occurred_at": _utc_iso(occurred_at),
    }


def calculate_policy_event_hash(previous_hash: str, payload: dict[str, Any]) -> str:
    """Calculates SHA-256(previous_hash + '|' + canonical_json(payload))."""
    if len(previous_hash) != 64:
        raise ValueError("previous_hash must be a 64-character SHA-256 digest")
    material = f"{previous_hash}|{_canonical_json(payload)}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def append_policy_lifecycle_event(
    session: Session,
    *,
    tenant_id: str,
    event_type: str,
    policy_key: str,
    policy_version: int,
    actor_key_id: str,
    details: dict[str, Any],
) -> PolicyLifecycleEvent:
    """Stages a lifecycle event in the current DB transaction; caller commits atomically."""
    previous = session.scalar(
        select(PolicyLifecycleEvent)
        .where(PolicyLifecycleEvent.tenant_id == tenant_id)
        .order_by(PolicyLifecycleEvent.id.desc())
        .limit(1)
    )
    previous_hash = previous.hash if previous is not None else GENESIS_HASH
    occurred_at = datetime.now(UTC)
    payload = _event_payload(
        tenant_id=tenant_id,
        event_type=event_type,
        policy_key=policy_key,
        policy_version=policy_version,
        actor_key_id=actor_key_id,
        details=details,
        occurred_at=occurred_at,
    )
    event = PolicyLifecycleEvent(
        tenant_id=tenant_id,
        event_type=event_type,
        policy_key=policy_key,
        policy_version=policy_version,
        actor_key_id=actor_key_id,
        details=details,
        occurred_at=occurred_at,
        prev_hash=previous_hash,
        hash=calculate_policy_event_hash(previous_hash, payload),
    )
    session.add(event)
    return event


def verify_policy_lifecycle_chain(session: Session, tenant_id: str) -> dict[str, Any]:
    """Verifies the SHA-256 policy lifecycle provenance chain for a tenant."""
    rows = session.scalars(
        select(PolicyLifecycleEvent)
        .where(PolicyLifecycleEvent.tenant_id == tenant_id)
        .order_by(PolicyLifecycleEvent.id.asc())
    ).all()
    expected_previous = GENESIS_HASH

    for index, row in enumerate(rows):
        if row.prev_hash != expected_previous:
            return {
                "valid": False,
                "checked_records": index,
                "failed_event_id": row.id,
                "reason": "Previous-hash pointer does not match the preceding policy event.",
                "last_hash": expected_previous,
            }
        payload = _event_payload(
            tenant_id=row.tenant_id,
            event_type=row.event_type,
            policy_key=row.policy_key,
            policy_version=row.policy_version,
            actor_key_id=row.actor_key_id,
            details=row.details,
            occurred_at=row.occurred_at,
        )
        recomputed = calculate_policy_event_hash(row.prev_hash, payload)
        if recomputed != row.hash:
            return {
                "valid": False,
                "checked_records": index + 1,
                "failed_event_id": row.id,
                "reason": "Policy event hash does not match its canonical payload.",
                "last_hash": expected_previous,
            }
        expected_previous = row.hash

    return {
        "valid": True,
        "checked_records": len(rows),
        "failed_event_id": None,
        "reason": "Policy lifecycle audit chain verification passed.",
        "last_hash": expected_previous,
    }