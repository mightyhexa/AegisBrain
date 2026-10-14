"""Deterministic, tenant-scoped HOLD approval and one-time token services.

These services provide an auditable approval authorization primitive. They do
not execute third-party actions; a production deployment must put the downstream
tool execution behind a gateway-controlled adapter which consumes authorization
and performs the action as one idempotent operation.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Decision, HoldAuditEvent, HoldRequest

HOLD_WRITE_LOCK = threading.RLock()
HOLD_TOKEN_TTL_SECONDS = 300
GENESIS_HASH = "0" * 64


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_dt(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def canonical_json(value: Any) -> str:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    )


def payload_digest(*, tenant_id: str, request_id: str, agent_id: str, action: str, params: dict) -> str:
    """Hash the complete action identity and exact JSON payload canonically."""
    material = {
        "tenant_id": tenant_id,
        "request_id": request_id,
        "agent_id": agent_id,
        "action": action,
        "params": params,
    }
    return hashlib.sha256(canonical_json(material).encode("utf-8")).hexdigest()


def _event_payload(event: HoldAuditEvent) -> dict[str, Any]:
    return {
        "tenant_id": event.tenant_id,
        "request_id": event.request_id,
        "event_type": event.event_type,
        "actor_key_id": event.actor_key_id,
        "payload_sha256": event.payload_sha256,
        "details": event.details,
        "occurred_at": _normalize_dt(event.occurred_at).isoformat(timespec="microseconds").replace("+00:00", "Z"),
    }


def _event_hash(previous_hash: str, payload: dict[str, Any]) -> str:
    if len(previous_hash) != 64:
        raise ValueError("previous hash must be a SHA-256 digest")
    return hashlib.sha256((previous_hash + "|" + canonical_json(payload)).encode("utf-8")).hexdigest()


def append_hold_event(
    session: Session,
    *,
    tenant_id: str,
    request_id: str,
    event_type: str,
    actor_key_id: str | None,
    payload_sha256: str,
    details: dict[str, Any],
) -> HoldAuditEvent:
    previous = session.scalar(
        select(HoldAuditEvent)
        .where(HoldAuditEvent.tenant_id == tenant_id)
        .order_by(HoldAuditEvent.id.desc())
        .limit(1)
    )
    occurred_at = utc_now()
    # Compute from the same exact values that are persisted in the event.
    event = HoldAuditEvent(
        tenant_id=tenant_id,
        request_id=request_id,
        event_type=event_type,
        actor_key_id=actor_key_id,
        payload_sha256=payload_sha256,
        details=details,
        occurred_at=occurred_at,
        prev_hash=previous.hash if previous is not None else GENESIS_HASH,
        hash="0" * 64,
    )
    event.hash = _event_hash(event.prev_hash, _event_payload(event))
    session.add(event)
    return event


def verify_hold_audit_chain(session: Session, tenant_id: str) -> dict[str, Any]:
    rows = session.scalars(
        select(HoldAuditEvent).where(HoldAuditEvent.tenant_id == tenant_id).order_by(HoldAuditEvent.id.asc())
    ).all()
    expected_previous = GENESIS_HASH
    for index, row in enumerate(rows):
        if row.prev_hash != expected_previous:
            return {
                "valid": False,
                "checked_records": index,
                "failed_event_id": row.id,
                "reason": "Previous-hash pointer does not match the preceding HOLD audit event.",
                "last_hash": expected_previous,
            }
        if _event_hash(row.prev_hash, _event_payload(row)) != row.hash:
            return {
                "valid": False,
                "checked_records": index + 1,
                "failed_event_id": row.id,
                "reason": "HOLD audit event hash does not match its canonical payload.",
                "last_hash": expected_previous,
            }
        expected_previous = row.hash
    return {
        "valid": True,
        "checked_records": len(rows),
        "failed_event_id": None,
        "reason": "HOLD approval audit chain verification passed.",
        "last_hash": expected_previous,
    }


def ensure_hold_for_decision(
    session: Session, *, tenant_id: str, decision: Decision, requested_by_key_id: str | None
) -> HoldRequest:
    """Idempotently create a pending HOLD row corresponding to an audit decision."""
    digest = payload_digest(
        tenant_id=tenant_id,
        request_id=decision.request_id,
        agent_id=decision.agent_id,
        action=decision.action,
        params=decision.params,
    )
    with HOLD_WRITE_LOCK:
        existing = session.scalar(
            select(HoldRequest).where(
                HoldRequest.tenant_id == tenant_id,
                HoldRequest.request_id == decision.request_id,
            )
        )
        if existing is not None:
            if not hmac.compare_digest(existing.payload_sha256, digest):
                raise ValueError("HOLD payload does not match its existing approval record")
            return existing
        row = HoldRequest(
            tenant_id=tenant_id,
            request_id=decision.request_id,
            agent_id=decision.agent_id,
            action=decision.action,
            params=decision.params,
            payload_sha256=digest,
            decision_hash=decision.hash,
            policy_key=decision.policy_key,
            policy_version=decision.policy_version,
            reason=decision.reason,
            requested_by_key_id=requested_by_key_id,
            status="pending",
        )
        session.add(row)
        session.flush()
        append_hold_event(
            session,
            tenant_id=tenant_id,
            request_id=decision.request_id,
            event_type="hold_requested",
            actor_key_id=requested_by_key_id,
            payload_sha256=digest,
            details={"decision_hash": decision.hash, "policy_key": decision.policy_key,
                     "policy_version": decision.policy_version, "status": "pending"},
        )
        session.commit()
        session.refresh(row)
        return row


def approve_hold(session: Session, *, row: HoldRequest, approver_key_id: str) -> tuple[str, datetime]:
    """Issue a high-entropy single-use token; persist only its digest."""
    if row.status != "pending":
        raise ValueError(f"Only pending HOLD requests can be approved (current status: {row.status}).")
    if row.requested_by_key_id is not None and hmac.compare_digest(row.requested_by_key_id, approver_key_id):
        raise PermissionError("Separation of duties: the requester cannot approve their own HOLD.")

    token = "aht_" + secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = utc_now()
    expires_at = now + timedelta(seconds=HOLD_TOKEN_TTL_SECONDS)

    row.status = "approved"
    row.approved_by_key_id = approver_key_id
    row.approved_at = now
    row.approval_token_hash = token_hash
    row.token_expires_at = expires_at
    row.updated_at = now
    append_hold_event(
        session,
        tenant_id=row.tenant_id,
        request_id=row.request_id,
        event_type="hold_approved_token_issued",
        actor_key_id=approver_key_id,
        payload_sha256=row.payload_sha256,
        details={"token_sha256": token_hash, "expires_at": expires_at.isoformat(),
                 "ttl_seconds": HOLD_TOKEN_TTL_SECONDS, "status": "approved"},
    )
    session.commit()
    session.refresh(row)
    return token, expires_at


def consume_approval_token(
    session: Session,
    *,
    row: HoldRequest,
    token: str,
    tenant_id: str,
    request_id: str,
    agent_id: str,
    action: str,
    params: dict,
    consumer_key_id: str,
) -> datetime:
    """Atomically validate payload/token and consume exactly once."""
    if row.status == "consumed":
        raise ValueError("Approval token has already been consumed.")
    if row.status == "expired":
        raise TimeoutError("Approval token has expired.")
    if row.status != "approved":
        raise ValueError("HOLD request has not been approved.")
    if not row.approval_token_hash or not row.token_expires_at:
        raise ValueError("HOLD request has no active approval token.")

    supplied_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(row.approval_token_hash, supplied_hash):
        raise PermissionError("Invalid approval token.")

    now = utc_now()
    if _normalize_dt(row.token_expires_at) <= now:
        row.status = "expired"
        row.updated_at = now
        append_hold_event(
            session, tenant_id=tenant_id, request_id=request_id, event_type="approval_token_expired",
            actor_key_id=consumer_key_id, payload_sha256=row.payload_sha256,
            details={"token_sha256": row.approval_token_hash, "status": "expired"},
        )
        session.commit()
        raise TimeoutError("Approval token has expired.")

    supplied_payload_hash = payload_digest(
        tenant_id=tenant_id, request_id=request_id, agent_id=agent_id, action=action, params=params
    )
    if not hmac.compare_digest(row.payload_sha256, supplied_payload_hash):
        raise ValueError("Request payload differs from the exact payload approved by the manager.")

    row.status = "consumed"
    row.token_used_at = now
    row.updated_at = now
    append_hold_event(
        session,
        tenant_id=tenant_id,
        request_id=request_id,
        event_type="approval_token_consumed",
        actor_key_id=consumer_key_id,
        payload_sha256=row.payload_sha256,
        details={"token_sha256": row.approval_token_hash, "consumer_key_id": consumer_key_id,
                 "status": "consumed"},
    )
    session.commit()
    return now
