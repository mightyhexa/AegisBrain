"""Tenant-scoped read-only policy inspection endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Policy
from app.schemas.evaluate import ActivePolicyResponse
from app.security.auth import Principal, require_scope

router = APIRouter(tags=["policies"])


@router.get("/active-policies", response_model=list[ActivePolicyResponse])
def list_active_policies(
    session: Session = Depends(get_db),
    principal: Principal = Depends(require_scope("policies:read")),
) -> list[ActivePolicyResponse]:
    rows = session.scalars(
        select(Policy)
        .where(
            Policy.tenant_id == principal.tenant_id,
            Policy.status == "active",
            Policy.locked_at.is_not(None),
        )
        .order_by(Policy.action.asc(), Policy.priority.desc(), Policy.policy_key.asc())
    ).all()
    return [
        ActivePolicyResponse(
            policy_key=row.policy_key,
            action=row.action,
            effect=row.effect,
            priority=row.priority,
            version=row.version,
            summary=row.summary,
            reason=row.reason,
        )
        for row in rows
    ]
