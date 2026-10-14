"""Manager communication channel hub (Slack, WhatsApp, Gmail) and NL-to-AST compiler."""

from __future__ import annotations

import hashlib
import re
import secrets
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import ChannelConnection, Policy, PolicyRevision
from app.db.policy_lifecycle_audit import (
    POLICY_LIFECYCLE_WRITE_LOCK,
    append_policy_lifecycle_event,
)
from app.schemas.channels import (
    ChannelConnectionResponse,
    ChannelConnectRequest,
    ChannelIngestResponse,
    ChannelMessageIngestRequest,
    ChannelProvider,
)
from app.schemas.policy import Condition, ConditionOperator, PolicyRule, Verdict
from app.schemas.policy_lifecycle import PolicyRevisionResponse
from app.security.auth import Principal, require_scope

router = APIRouter(prefix="/channels", tags=["manager channel hub"])

_DEFAULT_CHANNELS: tuple[dict[str, Any], ...] = (
    {
        "provider": "slack",
        "channel_target": "#ops-policies",
        "display_name": "Slack · #ops-policies (Leadership)",
        "authorized_managers": [
            "@vp-operations",
            "@head-of-finance",
            "fahad@aegisbrain.ai",
        ],
    },
    {
        "provider": "whatsapp",
        "channel_target": "+91-9876543210",
        "display_name": "WhatsApp Business · Executive Command",
        "authorized_managers": [
            "+91-9876543210",
            "+91-9000011111",
            "fahad@aegisbrain.ai",
        ],
    },
    {
        "provider": "gmail",
        "channel_target": "policies@aegisbrain.ai",
        "display_name": "Gmail · Risk & Policy Desk",
        "authorized_managers": [
            "cfo@aegisbrain.ai",
            "fahad@aegisbrain.ai",
            "risk-lead@aegisbrain.ai",
        ],
    },
)


def _ensure_default_channels(session: Session, tenant_id: str) -> None:
    """Idempotently seeds default Slack, WhatsApp, and Gmail connectors for the tenant."""
    existing_count = (
        session.scalar(
            select(func.count(ChannelConnection.id)).where(
                ChannelConnection.tenant_id == tenant_id
            )
        )
        or 0
    )
    if existing_count > 0:
        return

    now = datetime.now(UTC)
    for item in _DEFAULT_CHANNELS:
        session.add(
            ChannelConnection(
                tenant_id=tenant_id,
                provider=item["provider"],
                channel_target=item["channel_target"],
                display_name=item["display_name"],
                authorized_managers=item["authorized_managers"],
                status="connected",
                created_at=now,
            )
        )
    session.commit()


def _compile_natural_language_to_ast(text: str) -> dict[str, Any]:
    """Deterministically compiles a plain-English manager rule into a verified PolicyRule AST."""
    lower = text.lower()

    # 1. Determine target action
    if any(word in lower for word in ("discount", "promo", "coupon", "percent", "%")):
        action = "discounts.apply"
        field_name = "discount_percent"
    elif any(word in lower for word in ("payout", "transfer", "wire", "vendor")):
        action = "payouts.execute"
        field_name = "amount_inr"
    else:
        action = "refunds.create"
        field_name = "amount_inr"

    # 2. Determine verdict (ALLOW, HOLD, DENY)
    if any(word in lower for word in ("deny", "block", "forbid", "never", "prohibit", "reject")):
        effect = Verdict.DENY
        priority = 200
    elif any(word in lower for word in ("allow", "approve automatically", "auto-approve", "permit")):
        effect = Verdict.ALLOW
        priority = 80
    else:
        effect = Verdict.HOLD
        priority = 150

    # 3. Extract numeric threshold and comparison operator
    numbers = [
        float(match.replace(",", ""))
        for match in re.findall(r"\b\d+(?:,\d{3})*(?:\.\d+)?\b", text)
    ]
    threshold: int | float = (
        int(numbers[0])
        if numbers and numbers[0].is_integer()
        else (numbers[0] if numbers else (5 if field_name == "discount_percent" else 5000))
    )

    if any(phrase in lower for phrase in ("at least", "greater than or equal", ">=")):
        operator = ConditionOperator.GTE
    elif any(phrase in lower for phrase in ("under", "below", "less than", "<")):
        operator = ConditionOperator.LT
    elif any(phrase in lower for phrase in ("up to", "at most", "<=")):
        operator = ConditionOperator.LTE
    else:
        operator = ConditionOperator.GT

    conditions = [
        Condition(
            field=field_name,
            operator=operator,
            value=threshold,
        )
    ]

    slug_action = action.replace(".", "-")
    policy_key = f"{slug_action}-{effect.value.lower()}-{secrets.token_hex(2)}"
    cleaned_summary = text.strip()[:240]
    reason = f"Compiled from manager directive: '{cleaned_summary}' ({field_name} {operator.value} {threshold})."

    rule = PolicyRule(
        policy_key=policy_key,
        action=action,
        effect=effect,
        priority=priority,
        conditions=conditions,
        summary=cleaned_summary,
        reason=reason,
        version=1,
        status="active",
    )
    return rule.model_dump(mode="json")


@router.get("", response_model=list[ChannelConnectionResponse])
def list_channels(
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:read"))],
) -> list[ChannelConnectionResponse]:
    """Lists all configured Slack, WhatsApp, and Gmail channels for the tenant."""
    _ensure_default_channels(session, principal.tenant_id)
    rows = session.scalars(
        select(ChannelConnection)
        .where(ChannelConnection.tenant_id == principal.tenant_id)
        .order_by(ChannelConnection.id.asc())
    ).all()
    return [
        ChannelConnectionResponse(
            id=row.id,
            tenant_id=row.tenant_id,
            provider=cast(ChannelProvider, row.provider),
            channel_target=row.channel_target,
            display_name=row.display_name,
            authorized_managers=row.authorized_managers,
            status=cast(Literal["connected", "paused"], row.status),
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post(
    "/connect",
    response_model=ChannelConnectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def connect_channel(
    payload: ChannelConnectRequest,
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:write"))],
) -> ChannelConnectionResponse:
    """Connects or updates a Slack, WhatsApp, or Gmail manager channel."""
    existing = session.scalar(
        select(ChannelConnection).where(
            ChannelConnection.tenant_id == principal.tenant_id,
            ChannelConnection.provider == payload.provider,
            ChannelConnection.channel_target == payload.channel_target,
        )
    )
    now = datetime.now(UTC)
    if existing is not None:
        existing.display_name = payload.display_name
        existing.authorized_managers = payload.authorized_managers
        existing.status = "connected"
        session.commit()
        session.refresh(existing)
        row = existing
    else:
        row = ChannelConnection(
            tenant_id=principal.tenant_id,
            provider=payload.provider,
            channel_target=payload.channel_target,
            display_name=payload.display_name,
            authorized_managers=payload.authorized_managers,
            status="connected",
            created_at=now,
        )
        session.add(row)
        session.commit()
        session.refresh(row)

    return ChannelConnectionResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        provider=cast(ChannelProvider, row.provider),
        channel_target=row.channel_target,
        display_name=row.display_name,
        authorized_managers=row.authorized_managers,
        status=cast(Literal["connected", "paused"], row.status),
        created_at=row.created_at,
    )


@router.post(
    "/ingest",
    response_model=ChannelIngestResponse,
    status_code=status.HTTP_201_CREATED,
)
def ingest_manager_directive(
    payload: ChannelMessageIngestRequest,
    session: Annotated[Session, Depends(get_db)],
    principal: Annotated[Principal, Depends(require_scope("policies:write"))],
) -> ChannelIngestResponse:
    """Verifies manager authority on Slack/WhatsApp/Gmail, compiles plain-English
    into an AST policy draft, and records SHA-256 provenance.
    """
    _ensure_default_channels(session, principal.tenant_id)
    channel = session.scalar(
        select(ChannelConnection).where(
            ChannelConnection.tenant_id == principal.tenant_id,
            ChannelConnection.provider == payload.provider,
            ChannelConnection.channel_target == payload.channel_target,
        )
    )
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Channel {payload.provider}:{payload.channel_target} is not connected for this tenant.",
        )

    normalized_sender = payload.sender_identifier.strip().lower()
    allowed_senders = {item.strip().lower() for item in channel.authorized_managers}
    if normalized_sender not in allowed_senders:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Sender '{payload.sender_identifier}' is not in the authorized manager allowlist "
                f"for {payload.provider}:{payload.channel_target}."
            ),
        )

    compiled = _compile_natural_language_to_ast(payload.message_text)
    policy_key = str(compiled["policy_key"])

    with POLICY_LIFECYCLE_WRITE_LOCK:
        revision_max = (
            session.scalar(
                select(func.max(PolicyRevision.version)).where(
                    PolicyRevision.tenant_id == principal.tenant_id,
                    PolicyRevision.policy_key == policy_key,
                )
            )
            or 0
        )
        current_ver = (
            session.scalar(
                select(Policy.version).where(
                    Policy.tenant_id == principal.tenant_id,
                    Policy.policy_key == policy_key,
                )
            )
            or 0
        )
        version = max(revision_max, current_ver) + 1
        now = datetime.now(UTC)
        msg_id = payload.external_message_id or f"msg_{secrets.token_hex(6)}"
        source_channel_tag = f"{payload.provider}:{payload.channel_target}"
        actor_id = principal.key_id or f"{payload.provider}:{payload.sender_identifier}"[:32]

        revision = PolicyRevision(
            tenant_id=principal.tenant_id,
            policy_key=policy_key,
            action=str(compiled["action"]),
            effect=str(compiled["effect"]),
            priority=int(compiled["priority"]),
            conditions=list(compiled["conditions"]),
            summary=str(compiled["summary"]),
            reason=str(compiled["reason"]),
            status="draft",
            version=version,
            source_channel=source_channel_tag,
            source_message_id=msg_id,
            source_text=payload.message_text,
            authored_by=actor_id,
            approved_by=None,
            rejected_by=None,
            rejection_reason=None,
            locked_at=None,
            created_at=now,
            updated_at=now,
        )
        session.add(revision)
        session.flush()

        source_text_sha256 = hashlib.sha256(
            payload.message_text.encode("utf-8")
        ).hexdigest()
        append_policy_lifecycle_event(
            session,
            tenant_id=principal.tenant_id,
            event_type="channel_directive_ingested",
            policy_key=policy_key,
            policy_version=version,
            actor_key_id=actor_id,
            details={
                "provider": payload.provider,
                "channel_target": payload.channel_target,
                "sender": payload.sender_identifier,
                "source_message_id": msg_id,
                "source_text_sha256": source_text_sha256,
            },
        )
        session.commit()
        session.refresh(revision)

    return ChannelIngestResponse(
        status="draft_staged",
        provider=payload.provider,
        channel_target=payload.channel_target,
        sender_verified=payload.sender_identifier,
        compiled_ast=compiled,
        draft=PolicyRevisionResponse.model_validate(revision, from_attributes=True),
        message=(
            f"Manager directive from {payload.provider.upper()} ({payload.channel_target}) "
            "verified and compiled into a staged AST policy draft awaiting two-person lock."
        ),
    )