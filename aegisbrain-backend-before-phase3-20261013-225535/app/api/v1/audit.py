"""Tenant-scoped audit-chain verification endpoint for diagnostics."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.audit import verify_tenant_chain
from app.db.database import get_db
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
    session: Session = Depends(get_db),
    principal: Principal = Depends(require_scope("audit:read")),
) -> AuditVerificationResponse:
    return AuditVerificationResponse(**verify_tenant_chain(session, principal.tenant_id))
