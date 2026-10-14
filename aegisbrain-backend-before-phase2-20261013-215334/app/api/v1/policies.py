"""Read-only policy inspection endpoint for the local demo/dashboard."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.db.models import Policy
from app.schemas.evaluate import ActivePolicyResponse

router = APIRouter(tags=["policies"])


@router.get("/active-policies", response_model=list[ActivePolicyResponse])
def list_active_policies(session: Session = Depends(get_db)) -> list[ActivePolicyResponse]:
    rows = session.scalars(
        select(Policy)
        .where(
            Policy.tenant_id == settings.demo_tenant_id,
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
