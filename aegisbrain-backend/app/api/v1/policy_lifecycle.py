"""Tenant-scoped policy draft/review/lock lifecycle API."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Policy, PolicyRevision
from app.db.policy_lifecycle_audit import (
    POLICY_LIFECYCLE_WRITE_LOCK,
    append_policy_lifecycle_event,
    verify_policy_lifecycle_chain,
)
from app.engine.policies import DEFAULT_POLICIES
from app.schemas.policy import PolicyRule
from app.schemas.policy_lifecycle import (
    PolicyDraftCreate,
    PolicyDraftPatch,
    PolicyHistoryResponse,
    PolicyLifecycleVerificationResponse,
    PolicyRejectRequest,
    PolicyRevisionResponse,
)
from app.security.auth import Principal, require_scope

router = APIRouter(prefix="/policies", tags=["policy lifecycle"])
DRAFT_ROLES = frozenset({"policy_admin", "tenant_admin"})
REVIEW_ROLE = "tenant_admin"


def _require_writer(principal: Principal) -> str:
    """Enforces that the caller is an authenticated policy_admin or tenant_admin."""
    if (
        principal.is_development_demo
        or principal.key_id is None
        or principal.role not in DRAFT_ROLES
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A tenant-bound policy administrator key is required.",
        )
    return principal.key_id


def _require_reviewer(principal: Principal) -> str:
    """Enforces that the caller is an authenticated tenant_admin for locking/rejecting."""
    if (
        principal.is_development_demo
        or principal.key_id is None
        or principal.role != REVIEW_ROLE
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A tenant_admin key is required to lock or reject a policy.",
        )
    return principal.key_id


def _canonical(value: Any) -> str:
    """Serializes dictionaries deterministically for SHA-256 provenance hashing."""
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def _normalize_definition(data: dict[str, Any], *, version: int) -> dict[str, Any]:
    """Validates and normalizes a candidate policy definition against the AST schema."""
    rule = PolicyRule.model_validate(
        {
            "policy_key": data["policy_key"],
            "action": data["action"],
            "effect": data["effect"],
            "priority": data["priority"],
            "conditions": data["conditions"],
            "summary": data["summary"],
            "reason": data["reason"],
            "version": version,
            "status": "active",
        }
    )
    rendered = rule.model_dump(mode="json")
    return {
        "policy_key": rendered["policy_key"],
        "action": rendered["action"],
        "effect": rendered["effect"],
        "priority": rendered["priority"],
        "conditions": rendered["conditions"],
        "summary": rendered["summary"],
        "reason": rendered["reason"],
        "version": version,
    }


def _definition_from_row(row: PolicyRevision) -> dict[str, Any]:
    return {
        "policy_key": row.policy_key,
        "action": row.action,
        "effect": row.effect,
        "priority": row.priority,
        "conditions": row.conditions,
        "summary": row.summary,
        "reason": row.reason,
    }


def _definition_digest(definition: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical(definition).encode("utf-8")).hexdigest()


def _next_version(
    session: Session,
    tenant_id: str,
    policy_key: str,
    *,
    minimum: int = 1,
) -> int:
    revision_max = (
        session.scalar(
            select(func.max(PolicyRevision.version)).where(
                PolicyRevision.tenant_id == tenant_id,
                PolicyRevision.policy_key == policy_key,
            )
        )
        or 0
    )
    current = (
        session.scalar(
            select(Policy.version).where(
                Policy.tenant_id == tenant_id,
                Policy.policy_key == policy_key,
            )
        )
        or 0
    )
    return max(revision_max, current, minimum - 1) + 1


def _make_draft(
    session: Session,
    *,
    tenant_id: str,
    authored_by: str,
    payload: PolicyDraftCreate,
    minimum_version: int = 1,
) -> PolicyRevision:
    version = _next_version(
        session, tenant_id, payload.policy_key, minimum=minimum_version
    )
    definition = _normalize_definition(
        payload.model_dump(mode="json"), version=version
    )
    revision = PolicyRevision(
        tenant_id=tenant_id,
        policy_key=str(definition["policy_key"]),
        action=str(definition["action"]),
        effect=str(definition["effect"]),
        priority=int(definition["priority"]),
        conditions=list(definition["conditions"]),
        summary=str(definition["summary"]),
        reason=str(definition["reason"]),
        version=version,
        status="draft",
        source_channel=payload.source_channel,
        source_message_id=payload.source_message_id,
        source_text=payload.source_text,
        authored_by=authored_by,
        approved_by=None,
        rejected_by=None,
        rejection_reason=None,
        locked_at=None,
    )
    session.add(revision)
    session.flush()

    source_text_hash = (
        hashlib.sha256(payload.source_text.encode("utf-8")).hexdigest()
        if payload.source_text is not None
        else None
    )
    details = {
        "definition_sha256": _definition_digest(definition),
        "source_channel": payload.source_channel,
        "source_message_id": payload.source_message_id,
        "source_text_sha256": source_text_hash,
    }
    append_policy_lifecycle_event(
        session,
        tenant_id=tenant_id,
        event_type="draft_created",
        policy_key=revision.policy_key,
        policy_version=revision.version,
        actor_key_id=authored_by,
        details=details,
    )
    return revision


@router.get("/drafts", response_model=list[PolicyRevisionResponse])
def list_policy_drafts(
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:read"))],
) -> list[PolicyRevision]:
    """Lists all pending draft policy revisions for the authenticated tenant."""
    return list(
        session.scalars(
            select(PolicyRevision)
            .where(
                PolicyRevision.tenant_id == principal.tenant_id,
                PolicyRevision.status == "draft",
            )
            .order_by(PolicyRevision.created_at.asc(), PolicyRevision.id.asc())
        ).all()
    )


@router.post(
    "/drafts",
    response_model=PolicyRevisionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_policy_draft(
    payload: PolicyDraftCreate,
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:write"))],
) -> PolicyRevision:
    """Creates a new versioned policy draft awaiting two-person review."""
    actor = _require_writer(principal)
    try:
        with POLICY_LIFECYCLE_WRITE_LOCK:
            revision = _make_draft(
                session,
                tenant_id=principal.tenant_id,
                authored_by=actor,
                payload=payload,
            )
            session.commit()
            session.refresh(revision)
            return revision
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A policy revision with this tenant, key, and version already exists.",
        ) from exc
    except Exception:
        session.rollback()
        raise


@router.post(
    "/drafts/bootstrap-baseline",
    response_model=list[PolicyRevisionResponse],
    status_code=status.HTTP_201_CREATED,
)
def bootstrap_baseline_drafts(
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:write"))],
) -> list[PolicyRevision]:
    """Creates drafts for the three built-in baseline rules; a different admin must lock them."""
    actor = _require_writer(principal)
    created: list[PolicyRevision] = []
    try:
        with POLICY_LIFECYCLE_WRITE_LOCK:
            for rule in DEFAULT_POLICIES:
                existing_draft = session.scalar(
                    select(PolicyRevision.id).where(
                        PolicyRevision.tenant_id == principal.tenant_id,
                        PolicyRevision.policy_key == rule.policy_key,
                        PolicyRevision.status == "draft",
                    )
                )
                if existing_draft is not None:
                    continue
                payload = PolicyDraftCreate(
                    policy_key=rule.policy_key,
                    action=rule.action,
                    effect=rule.effect,
                    priority=rule.priority,
                    conditions=rule.conditions,
                    summary=rule.summary,
                    reason=rule.reason,
                    source_channel="preset:baseline-v1",
                    source_message_id=None,
                    source_text="Built-in AegisBrain demo baseline preset; not a Slack approval.",
                )
                created.append(
                    _make_draft(
                        session,
                        tenant_id=principal.tenant_id,
                        authored_by=actor,
                        payload=payload,
                        minimum_version=rule.version,
                    )
                )
            session.commit()
            for row in created:
                session.refresh(row)
            return created
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Baseline bootstrap conflicted with another policy write; retry.",
        ) from exc
    except Exception:
        session.rollback()
        raise


@router.patch("/drafts/{revision_id}", response_model=PolicyRevisionResponse)
def update_policy_draft(
    revision_id: int,
    patch: PolicyDraftPatch,
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:write"))],
) -> PolicyRevision:
    """Updates an existing draft revision prior to lock or rejection."""
    actor = _require_writer(principal)
    supplied = patch.model_dump(mode="json", exclude_unset=True)

    with POLICY_LIFECYCLE_WRITE_LOCK:
        revision = session.scalar(
            select(PolicyRevision).where(
                PolicyRevision.id == revision_id,
                PolicyRevision.tenant_id == principal.tenant_id,
            )
        )
        if revision is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Policy draft not found.",
            )
        if revision.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only a draft policy revision can be edited.",
            )
        if revision.authored_by != actor and principal.role != "tenant_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the draft author or a tenant_admin may edit this draft.",
            )

        editable_fields = {
            "action",
            "effect",
            "priority",
            "conditions",
            "summary",
            "reason",
        }
        candidate = _definition_from_row(revision)
        candidate.update(
            {
                key: value
                for key, value in supplied.items()
                if key in editable_fields
            }
        )
        try:
            normalized = _normalize_definition(
                candidate, version=revision.version
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid policy definition: {exc}",
            ) from exc

        before_digest = _definition_digest(_definition_from_row(revision))
        for field, value in normalized.items():
            setattr(revision, field, value)
        for field in ("source_channel", "source_message_id", "source_text"):
            if field in supplied:
                setattr(revision, field, supplied[field])
        revision.updated_at = datetime.now(UTC)
        after_digest = _definition_digest(_definition_from_row(revision))

        append_policy_lifecycle_event(
            session,
            tenant_id=principal.tenant_id,
            event_type="draft_updated",
            policy_key=revision.policy_key,
            policy_version=revision.version,
            actor_key_id=actor,
            details={
                "before_definition_sha256": before_digest,
                "after_definition_sha256": after_digest,
                "changed_fields": sorted(supplied.keys()),
            },
        )
        try:
            session.commit()
            session.refresh(revision)
            return revision
        except Exception:
            session.rollback()
            raise


@router.post("/drafts/{revision_id}/lock", response_model=PolicyRevisionResponse)
def lock_policy_draft(
    revision_id: int,
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:write"))],
) -> PolicyRevision:
    """Locks a draft into an active runtime policy, enforcing two-person integrity."""
    reviewer = _require_reviewer(principal)
    try:
        with POLICY_LIFECYCLE_WRITE_LOCK:
            revision = session.scalar(
                select(PolicyRevision).where(
                    PolicyRevision.id == revision_id,
                    PolicyRevision.tenant_id == principal.tenant_id,
                )
            )
            if revision is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Policy draft not found.",
                )
            if revision.status != "draft":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Only a draft policy revision can be locked.",
                )
            if revision.authored_by == reviewer:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Separation of duties: a different tenant_admin key must approve this draft.",
                )

            definition = _normalize_definition(
                _definition_from_row(revision), version=revision.version
            )
            current = session.scalar(
                select(Policy).where(
                    Policy.tenant_id == principal.tenant_id,
                    Policy.policy_key == revision.policy_key,
                )
            )
            if current is not None and revision.version <= current.version:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Draft version is not newer than the currently published policy.",
                )

            old_active_revisions = session.scalars(
                select(PolicyRevision).where(
                    PolicyRevision.tenant_id == principal.tenant_id,
                    PolicyRevision.policy_key == revision.policy_key,
                    PolicyRevision.status == "active",
                )
            ).all()
            for old_revision in old_active_revisions:
                old_revision.status = "superseded"

            locked_at = datetime.now(UTC)
            revision.status = "active"
            revision.approved_by = reviewer
            revision.rejected_by = None
            revision.rejection_reason = None
            revision.locked_at = locked_at
            revision.updated_at = locked_at

            if current is None:
                current = Policy(
                    tenant_id=principal.tenant_id,
                    policy_key=revision.policy_key,
                    action=str(definition["action"]),
                    effect=str(definition["effect"]),
                    priority=int(definition["priority"]),
                    conditions=list(definition["conditions"]),
                    summary=str(definition["summary"]),
                    reason=str(definition["reason"]),
                    version=int(definition["version"]),
                    status="active",
                    source_channel=revision.source_channel,
                    source_message_id=revision.source_message_id,
                    authored_by=revision.authored_by,
                    approved_by=reviewer,
                    locked_at=locked_at,
                    is_demo_fixture=False,
                )
                session.add(current)
            else:
                for field, value in definition.items():
                    setattr(current, field, value)
                current.status = "active"
                current.source_channel = revision.source_channel
                current.source_message_id = revision.source_message_id
                current.authored_by = revision.authored_by
                current.approved_by = reviewer
                current.locked_at = locked_at
                current.is_demo_fixture = False

            source_text_hash = (
                hashlib.sha256(revision.source_text.encode("utf-8")).hexdigest()
                if revision.source_text is not None
                else None
            )
            append_policy_lifecycle_event(
                session,
                tenant_id=principal.tenant_id,
                event_type="policy_locked",
                policy_key=revision.policy_key,
                policy_version=revision.version,
                actor_key_id=reviewer,
                details={
                    "definition_sha256": _definition_digest(definition),
                    "authored_by": revision.authored_by,
                    "approved_by": reviewer,
                    "source_channel": revision.source_channel,
                    "source_message_id": revision.source_message_id,
                    "source_text_sha256": source_text_hash,
                },
            )
            session.commit()
            session.refresh(revision)
            return revision
    except HTTPException:
        session.rollback()
        raise
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Policy lock conflicted with another write; reload and retry.",
        ) from exc
    except Exception:
        session.rollback()
        raise


@router.post("/drafts/{revision_id}/reject", response_model=PolicyRevisionResponse)
def reject_policy_draft(
    revision_id: int,
    payload: PolicyRejectRequest,
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:write"))],
) -> PolicyRevision:
    """Rejects a pending draft revision with an auditable reason."""
    reviewer = _require_reviewer(principal)
    with POLICY_LIFECYCLE_WRITE_LOCK:
        revision = session.scalar(
            select(PolicyRevision).where(
                PolicyRevision.id == revision_id,
                PolicyRevision.tenant_id == principal.tenant_id,
            )
        )
        if revision is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Policy draft not found.",
            )
        if revision.status != "draft":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only a draft policy revision can be rejected.",
            )
        if revision.authored_by == reviewer:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Separation of duties: a different tenant_admin key must reject this draft.",
            )

        revision.status = "rejected"
        revision.rejected_by = reviewer
        revision.rejection_reason = payload.reason
        revision.updated_at = datetime.now(UTC)

        append_policy_lifecycle_event(
            session,
            tenant_id=principal.tenant_id,
            event_type="draft_rejected",
            policy_key=revision.policy_key,
            policy_version=revision.version,
            actor_key_id=reviewer,
            details={
                "authored_by": revision.authored_by,
                "rejected_by": reviewer,
                "rejection_reason": payload.reason,
            },
        )
        try:
            session.commit()
            session.refresh(revision)
            return revision
        except Exception:
            session.rollback()
            raise


@router.get("/history/{policy_key}", response_model=PolicyHistoryResponse)
def policy_history(
    policy_key: str,
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:read"))],
) -> PolicyHistoryResponse:
    """Returns the complete versioned revision history for a given policy key."""
    rows = session.scalars(
        select(PolicyRevision)
        .where(
            PolicyRevision.tenant_id == principal.tenant_id,
            PolicyRevision.policy_key == policy_key,
        )
        .order_by(PolicyRevision.version.desc())
    ).all()
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy history not found.",
        )
    revisions = [
        PolicyRevisionResponse.model_validate(row, from_attributes=True)
        for row in rows
    ]
    return PolicyHistoryResponse(policy_key=policy_key, revisions=revisions)


@router.get("/audit/verify", response_model=PolicyLifecycleVerificationResponse)
def verify_policy_audit_chain(
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("audit:read"))],
) -> PolicyLifecycleVerificationResponse | dict[str, Any]:
    """Cryptographically verifies the SHA-256 policy lifecycle provenance chain."""
    return verify_policy_lifecycle_chain(session, principal.tenant_id)