"""Tenant-scoped deterministic runtime policy evaluation endpoint."""

from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.audit import IdempotencyConflict, append_or_replay_decision
from app.db.database import get_db
from app.db.models import Policy
from app.services.holds import ensure_hold_for_decision
from app.engine.evaluator import EvaluationResult, evaluate
from app.engine.policies import DEFAULT_POLICIES
from app.schemas.evaluate import EvaluateRequest, EvaluateResponse
from app.schemas.policy import PolicyRule, Verdict
from app.security.auth import Principal, require_scope

router = APIRouter(tags=["runtime evaluation"])


def _active_policy_objects(session: Session, tenant_id: str) -> list[PolicyRule]:
    rows = session.scalars(
        select(Policy).where(
            Policy.tenant_id == tenant_id,
            Policy.status == "active",
            Policy.locked_at.is_not(None),
        )
    ).all()
    # Every tenant must have a complete, approved baseline bundle before any
    # registered action can be evaluated. A tenant with no baseline fails closed.
    required_keys = {rule.policy_key for rule in DEFAULT_POLICIES}
    loaded_keys = {row.policy_key for row in rows}
    missing_keys = required_keys - loaded_keys
    if missing_keys:
        missing_display = ", ".join(sorted(missing_keys))
        raise ValueError(f"Required baseline policy bundle is incomplete: {missing_display}")

    return [
        PolicyRule.model_validate(
            {
                "policy_key": row.policy_key,
                "action": row.action,
                "effect": row.effect,
                "priority": row.priority,
                "conditions": row.conditions,
                "summary": row.summary,
                "reason": row.reason,
                "version": row.version,
                "status": row.status,
            }
        )
        for row in rows
    ]


def _response(row) -> EvaluateResponse:
    evaluated_at = row.evaluated_at
    if evaluated_at.tzinfo is None:
        evaluated_at = evaluated_at.replace(tzinfo=timezone.utc)
    return EvaluateResponse(
        request_id=row.request_id,
        decision=row.verdict.lower(),
        policy_key=row.policy_key,
        reason=row.reason,
        evaluated_at=evaluated_at,
        latency_ms=row.engine_latency_ms,
        audit_hash=row.hash,
    )


@router.post("/evaluate", response_model=EvaluateResponse)
def evaluate_action(
    request: EvaluateRequest,
    session: Session = Depends(get_db),
    principal: Principal = Depends(require_scope("gateway:evaluate")),
) -> EvaluateResponse:
    try:
        policies = _active_policy_objects(session, principal.tenant_id)
        result = evaluate(request, policies)
    except (ValidationError, ValueError, TypeError):
        # Never omit a malformed/incomplete active bundle and accidentally allow.
        result = EvaluationResult(
            decision=Verdict.DENY,
            policy_key=None,
            policy_version=None,
            reason="Active policy configuration is invalid; request denied by fail-closed protection.",
            latency_ms=0.0,
        )

    try:
        row, _created = append_or_replay_decision(
            session,
            tenant_id=principal.tenant_id,
            request_id=request.request_id,
            agent_id=request.agent_id,
            action=request.action,
            params=request.params,
            verdict=result.decision.value,
            policy_key=result.policy_key,
            policy_version=result.policy_version,
            reason=result.reason,
            engine_latency_ms=result.latency_ms,
        )
    except IdempotencyConflict as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="request_id was already used with a different payload.",
        ) from exc

    # Persist HOLD state separately from the decision hash chain. This is
    # idempotent, so retrying an identical evaluation repairs a missing pending
    # row without resetting an already approved/consumed request.
    if row.verdict == Verdict.HOLD.value:
        try:
            ensure_hold_for_decision(
                session,
                tenant_id=principal.tenant_id,
                decision=row,
                requested_by_key_id=principal.key_id,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="HOLD approval state conflicts with the audited decision payload.",
            ) from exc

    return _response(row)
