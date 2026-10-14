"""Tenant-scoped audit-chain verification and live telemetry endpoints."""

from __future__ import annotations

from datetime import UTC
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.audit import verify_tenant_chain
from app.db.database import get_db
from app.db.models import Decision
from app.schemas.evaluate import DecisionRecordResponse
from app.security.auth import Principal, require_scope

router = APIRouter(tags=["audit diagnostics"])


class AuditVerificationResponse(BaseModel):
    valid: bool
    checked_records: int
    failed_request_id: str | None
    reason: str
    last_hash: str


@router.get("/audit/verify", response_model=AuditVerificationResponse)
def verify_audit(
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("audit:read"))],
) -> AuditVerificationResponse:
    """Verifies the SHA-256 decision hash chain for the authenticated tenant."""
    return AuditVerificationResponse(
        **verify_tenant_chain(session, principal.tenant_id)
    )


@router.get("/decisions", response_model=list[DecisionRecordResponse])
def list_recent_decisions(
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("audit:read"))],
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
) -> list[DecisionRecordResponse]:
    """Returns the most recent audited runtime evaluations for the Control Room feed."""
    rows = session.scalars(
        select(Decision)
        .where(Decision.tenant_id == principal.tenant_id)
        .order_by(Decision.id.desc())
        .limit(limit)
    ).all()

    results: list[DecisionRecordResponse] = []
    for row in rows:
        evaluated_at = row.evaluated_at
        if evaluated_at.tzinfo is None:
            evaluated_at = evaluated_at.replace(tzinfo=UTC)
        results.append(
            DecisionRecordResponse(
                id=row.id,
                request_id=row.request_id,
                agent_id=row.agent_id,
                action=row.action,
                params=row.params,
                verdict=cast(Literal["ALLOW", "HOLD", "DENY"], row.verdict),
                policy_key=row.policy_key,
                policy_version=row.policy_version,
                reason=row.reason,
                engine_latency_ms=row.engine_latency_ms,
                evaluated_at=evaluated_at,
                prev_hash=row.prev_hash,
                hash=row.hash,
            )
        )
    return results