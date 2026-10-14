"""Tamper-evident SHA-256 audit-chain implementation for Stage 0.

This is a per-tenant sequential hash chain. A process lock protects the local,
single-process SQLite demo from concurrent writers racing to choose the same
previous hash. A multi-worker/production deployment needs a database-level
serialization/locking design and externally anchored checkpoints.
"""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Decision

GENESIS_HASH = "0" * 64
_AUDIT_WRITE_LOCK = threading.Lock()


class IdempotencyConflict(Exception):
    """Raised when a request ID is reused with a different input payload."""


def _utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _canonical_json(value: Any) -> str:
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
    request_id: str,
    agent_id: str,
    action: str,
    params: dict,
    verdict: str,
    policy_key: str | None,
    policy_version: int | None,
    reason: str,
    evaluated_at: datetime,
) -> dict[str, Any]:
    # Covers the fields mandated by the product specification and also covers
    # tenant, policy attribution, and reason so those cannot be altered silently.
    return {
        "tenant_id": tenant_id,
        "request_id": request_id,
        "agent_id": agent_id,
        "action": action,
        "params": params,
        "verdict": verdict,
        "policy_key": policy_key,
        "policy_version": policy_version,
        "reason": reason,
        "timestamp": _utc_iso(evaluated_at),
    }


def calculate_event_hash(previous_hash: str, event_payload: dict[str, Any]) -> str:
    if len(previous_hash) != 64:
        raise ValueError("previous_hash must be a 64-character SHA-256 hex digest")
    material = previous_hash + "|" + _canonical_json(event_payload)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def append_or_replay_decision(
    session: Session,
    *,
    tenant_id: str,
    request_id: str,
    agent_id: str,
    action: str,
    params: dict,
    verdict: str,
    policy_key: str | None,
    policy_version: int | None,
    reason: str,
    engine_latency_ms: float,
) -> tuple[Decision, bool]:
    """Append one audit record or return an identical prior request's record.

    The boolean is True if a new decision was written and False if idempotently
    replayed. Reusing a request_id with a different input is rejected.
    """
    with _AUDIT_WRITE_LOCK:
        existing = session.scalar(
            select(Decision).where(
                Decision.tenant_id == tenant_id,
                Decision.request_id == request_id,
            )
        )
        if existing is not None:
            same_input = (
                existing.agent_id == agent_id
                and existing.action == action
                and _canonical_json(existing.params) == _canonical_json(params)
            )
            if not same_input:
                raise IdempotencyConflict("request_id has already been used with a different payload")
            return existing, False

        previous = session.scalar(
            select(Decision)
            .where(Decision.tenant_id == tenant_id)
            .order_by(Decision.id.desc())
            .limit(1)
        )
        previous_hash = previous.hash if previous is not None else GENESIS_HASH
        evaluated_at = datetime.now(timezone.utc)
        payload = _event_payload(
            tenant_id=tenant_id,
            request_id=request_id,
            agent_id=agent_id,
            action=action,
            params=params,
            verdict=verdict,
            policy_key=policy_key,
            policy_version=policy_version,
            reason=reason,
            evaluated_at=evaluated_at,
        )
        digest = calculate_event_hash(previous_hash, payload)
        row = Decision(
            tenant_id=tenant_id,
            request_id=request_id,
            agent_id=agent_id,
            action=action,
            params=params,
            verdict=verdict,
            policy_key=policy_key,
            policy_version=policy_version,
            reason=reason,
            engine_latency_ms=engine_latency_ms,
            evaluated_at=evaluated_at,
            prev_hash=previous_hash,
            hash=digest,
        )
        session.add(row)
        try:
            session.commit()
            session.refresh(row)
        except Exception:
            session.rollback()
            raise
        return row, True


def verify_tenant_chain(session: Session, tenant_id: str) -> dict[str, Any]:
    rows = session.scalars(
        select(Decision)
        .where(Decision.tenant_id == tenant_id)
        .order_by(Decision.id.asc())
    ).all()
    expected_previous = GENESIS_HASH

    for index, row in enumerate(rows):
        if row.prev_hash != expected_previous:
            return {
                "valid": False,
                "checked_records": index,
                "failed_request_id": row.request_id,
                "reason": "Previous-hash pointer does not match the preceding record.",
                "last_hash": expected_previous,
            }
        payload = _event_payload(
            tenant_id=row.tenant_id,
            request_id=row.request_id,
            agent_id=row.agent_id,
            action=row.action,
            params=row.params,
            verdict=row.verdict,
            policy_key=row.policy_key,
            policy_version=row.policy_version,
            reason=row.reason,
            evaluated_at=row.evaluated_at,
        )
        recomputed = calculate_event_hash(row.prev_hash, payload)
        if recomputed != row.hash:
            return {
                "valid": False,
                "checked_records": index + 1,
                "failed_request_id": row.request_id,
                "reason": "Record hash does not match its canonical event payload.",
                "last_hash": expected_previous,
            }
        expected_previous = row.hash

    return {"valid": True, "checked_records": len(rows), "failed_request_id": None,
            "reason": "Audit chain verification passed.", "last_hash": expected_previous}
