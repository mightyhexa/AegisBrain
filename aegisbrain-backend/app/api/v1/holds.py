"""Tenant-scoped HOLD approval and payload-bound single-use token API.

These endpoints manage authorization state only. They deliberately do not claim
that a downstream financial/destructive tool was executed; production execution
must be performed by a gateway-controlled adapter with its own idempotency and
failure-recovery semantics.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

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


def _to_utc(value: datetime | None) -> datetime:
    """Ensures a datetime is strictly non-null and timezone-aware with UTC offset."""
    if value is None:
        return datetime.now(UTC)
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _require_reviewer(principal: Principal) -> str:
    """Enforces that only an authenticated tenant_admin key can approve quarantine holds."""
    if principal.is_development_demo or principal.key_id is None or principal.role != "tenant_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A tenant-bound tenant_admin key is required to approve a HOLD.",
        )
    return principal.key_id


def _find_hold(session: Session, tenant_id: str, request_id: str) -> HoldRequest:
    """Retrieves a HOLD record strictly scoped to the principal's tenant."""
    row = session.scalar(
        select(HoldRequest).where(
            HoldRequest.tenant_id == tenant_id,
            HoldRequest.request_id == request_id,
        )
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="HOLD request not found.",
        )
    return row


@router.get("", response_model=list[HoldResponse])
def list_holds(
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:read"))],
    hold_status: Annotated[
        str | None,
        Query(
            alias="status",
            pattern="^(pending|approved|consumed|expired)$",
            description="Filter holds by status",
        ),
    ] = None,
) -> list[HoldRequest]:
    """Lists quarantine holds for the tenant with optional status filtering."""
    statement = select(HoldRequest).where(HoldRequest.tenant_id == principal.tenant_id)
    if hold_status:
        statement = statement.where(HoldRequest.status == hold_status)
    return list(
        session.scalars(
            statement.order_by(HoldRequest.created_at.desc(), HoldRequest.id.desc()).limit(500)
        ).all()
    )


# Explicit route declared before the catch-all {request_id} route to prevent routing collision
@router.get("/audit/verify", response_model=HoldAuditVerificationResponse)
def verify_holds_audit(
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("audit:read"))],
) -> HoldAuditVerificationResponse | dict[str, Any]:
    """Cryptographically verifies the per-tenant SHA-256 HOLD audit hash chain."""
    return verify_hold_audit_chain(session, principal.tenant_id)


@router.get("/{request_id}", response_model=HoldResponse)
def get_hold(
    request_id: str,
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:read"))],
) -> HoldRequest:
    """Retrieves a single HOLD record by its unique idempotency request ID."""
    return _find_hold(session, principal.tenant_id, request_id)


@router.post("/{request_id}/approve", response_model=HoldApprovalResponse)
def approve_hold(
    request_id: str,
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:write"))],
) -> HoldApprovalResponse:
    """Approves a quarantined action and mints a short-lived single-use approval token."""
    reviewer_key_id = _require_reviewer(principal)
    with HOLD_WRITE_LOCK:
        row = _find_hold(session, principal.tenant_id, request_id)
        try:
            token, raw_expires_at = issue_approval_token(
                session, row=row, approver_key_id=reviewer_key_id
            )
        except (PermissionError, ValueError) as exc:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(exc),
            ) from exc

        approved_at_utc = _to_utc(row.approved_at)
        expires_at_utc = _to_utc(raw_expires_at)
        return HoldApprovalResponse(
            request_id=row.request_id,
            status="approved",
            approved_by_key_id=reviewer_key_id,
            approved_at=approved_at_utc,
            token_expires_at=expires_at_utc,
            token_ttl_seconds=HOLD_TOKEN_TTL_SECONDS,
            approval_token=token,
            token_storage="sha256_digest_only",
            payload_sha256=row.payload_sha256,
        )


@router.post("/{request_id}/consume", response_model=HoldConsumeResponse)
def consume_hold_token(
    request_id: str,
    payload: HoldConsumeRequest,
    approval_token: Annotated[
        str,
        Header(
            alias="X-Aegis-Approval-Token",
            min_length=20,
            max_length=256,
            description="Single-use approval token issued by manager",
        ),
    ],
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("gateway:evaluate"))],
) -> HoldConsumeResponse:
    """Burns a single-use approval token against an identical action payload."""
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
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
            ) from exc
        except TimeoutError as exc:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail=str(exc),
            ) from exc
        except ValueError as exc:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(exc),
            ) from exc

        return HoldConsumeResponse(
            authorized=True,
            request_id=request_id,
            status="consumed",
            payload_sha256=row.payload_sha256,
            consumed_at=_to_utc(consumed_at),
            execution="not_performed",
            message=(
                "Approval authorized and token consumed. This endpoint does not execute the downstream action; "
                "a gateway-controlled tool adapter must perform execution."
            ),
        )