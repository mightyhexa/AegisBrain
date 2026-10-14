"""Audit-chain verification endpoint for local testing and diagnostics."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db.audit import verify_tenant_chain
from app.db.database import get_db

router = APIRouter(tags=["audit diagnostics"])


class AuditVerificationResponse(BaseModel):
    valid: bool
    checked_records: int
    failed_request_id: str | None
    reason: str
    last_hash: str


@router.get("/audit/verify", response_model=AuditVerificationResponse)
def verify_audit(session: Session = Depends(get_db)) -> AuditVerificationResponse:
    return AuditVerificationResponse(**verify_tenant_chain(session, settings.demo_tenant_id))
