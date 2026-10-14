"""Tenant-scoped HOLD approval and payload-bound single-use token API.

These endpoints manage authorization state only. They deliberately do not claim
that a downstream financial/destructive tool was executed; production execution
must be performed by a gateway-controlled adapter with its own idempotency and
failure-recovery semantics.
"""

from __future__ import annotations

from datetime import timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import HoldRequest
from app.schemas.holds import (
    HoldApprovalResponse,
    HoldAuditVerificationResponse,
    HoldConsumeRequest,
    HoldConsumeResponse,
    HoldResponse,
)
from app.security.auth import Principal, require_scope
from app.services.holds import (
    HOLD_TOKEN_TTL_SECONDS,
    HOLD_WRITE_LOCK,
    approve_hold as issue_approval_token,
    consume_approval_token,
    verify_hold_audit_chain,
)

router = APIRouter(prefix="/holds", tags=["HOLD approvals"])


def _aware(value):
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


def _require_reviewer(principal: Principal) -> str:
    if principal.is_development_demo or principal.key_id is None or principal.role != "tenant_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A tenant-bound tenant_admin key is required to approve a HOLD.",
        )
    return principal.key_id


def _find_hold(session: Session, tenant_id: str, request_id: str) -> HoldRequest:
    row = session.scalar(
        select(HoldRequest).where(
            HoldRequest.tenant_id == tenant_id,
            HoldRequest.request_id == request_id,
        )
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="HOLD request not found.")
    return row


@router.get("", response_model=list[HoldResponse])
def list_holds(
    hold_status: str | None = Query(default=None, alias="status", pattern="^(pending|approved|consumed|expired)$"),
    session: Session = Depends(get_db),
    principal: Principal = Depends(require_scope("policies:read")),
) -> list[HoldRequest]:
    statement = select(HoldRequest).where(HoldRequest.tenant_id == principal.tenant_id)
    if hold_status:
        statement = statement.where(HoldRequest.status == hold_status)
    return session.scalars(statement.order_by(HoldRequest.created_at.desc(), HoldRequest.id.desc()).limit(500)).all()


# This explicit multi-segment route is declared before the catch-all request ID route.
@router.get("/audit/verify", response_model=HoldAuditVerificationResponse)
def verify_holds_audit(
    session: Session = Depends(get_db),
    principal: Principal = Depends(require_scope("audit:read")),
) -> dict:
    return verify_hold_audit_chain(session, principal.tenant_id)


@router.get("/{request_id}", response_model=HoldResponse)
def get_hold(
    request_id: str,
    session: Session = Depends(get_db),
    principal: Principal = Depends(require_scope("policies:read")),
) -> HoldRequest:
    return _find_hold(session, principal.tenant_id, request_id)


@router.post("/{request_id}/approve", response_model=HoldApprovalResponse)
def approve_hold(
    request_id: str,
    session: Session = Depends(get_db),
    principal: Principal = Depends(require_scope("policies:write")),
) -> HoldApprovalResponse:
    reviewer_key_id = _require_reviewer(principal)
    with HOLD_WRITE_LOCK:
        row = _find_hold(session, principal.tenant_id, request_id)
        try:
            token, expires_at = issue_approval_token(session, row=row, approver_key_id=reviewer_key_id)
        except PermissionError as exc:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        except ValueError as exc:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

        approved_at = _aware(row.approved_at)
        expires_at = _aware(expires_at)
        return HoldApprovalResponse(
            request_id=row.request_id,
            status="approved",
            approved_by_key_id=reviewer_key_id,
            approved_at=approved_at,
            token_expires_at=expires_at,
            token_ttl_seconds=HOLD_TOKEN_TTL_SECONDS,
            approval_token=token,
            token_storage="sha256_digest_only",
            payload_sha256=row.payload_sha256,
        )


@router.post("/{request_id}/consume", response_model=HoldConsumeResponse)
def consume_hold_token(
    request_id: str,
    payload: HoldConsumeRequest,
    approval_token: str = Header(alias="X-Aegis-Approval-Token", min_length=20, max_length=256),
    session: Session = Depends(get_db),
    principal: Principal = Depends(require_scope("gateway:evaluate")),
) -> HoldConsumeResponse:
    if principal.is_development_demo or principal.key_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A tenant-bound runtime API key is required to consume a HOLD token.",
        )

    with HOLD_WRITE_LOCK:
        row = _find_hold(session, principal.tenant_id, request_id)
        try:
            consumed_at = consume_approval_token(
                session,
                row=row,
                token=approval_token,
                tenant_id=principal.tenant_id,
                request_id=request_id,
                agent_id=payload.agent_id,
                action=payload.action,
                params=payload.params,
                consumer_key_id=principal.key_id,
            )
        except PermissionError as exc:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
        except TimeoutError as exc:
            # Service commits the expired state/event before raising this error.
            raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc)) from exc
        except ValueError as exc:
            session.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

        return HoldConsumeResponse(
            authorized=True,
            request_id=request_id,
            status="consumed",
            payload_sha256=row.payload_sha256,
            consumed_at=_aware(consumed_at),
            execution="not_performed",
            message=(
                "Approval authorized and token consumed. This endpoint does not execute the downstream action; "
                "a gateway-controlled tool adapter must perform execution."
            ),
        )
