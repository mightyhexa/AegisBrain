"""B2B client registration and isolated tenant workspace provisioning API."""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import APIKey, ClientRegistration, Policy, PolicyRevision, Tenant
from app.engine.policies import DEFAULT_POLICIES
from app.schemas.onboarding import (
    ClientRegistrationRequest,
    ClientRegistrationResponse,
    IssuedCredential,
)
from app.security.auth import (
    ROLE_SCOPES,
    generate_api_key_material,
    hash_api_key_secret,
)

router = APIRouter(prefix="/onboarding", tags=["B2B client onboarding"])


def _slugify(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return cleaned[:24] or "enterprise"


@router.post(
    "/register",
    response_model=ClientRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_client_workspace(
    payload: ClientRegistrationRequest,
    session: Annotated[Session, Depends(get_db)],
) -> ClientRegistrationResponse:
    """Registers a B2B client, provisions an isolated tenant, seeds baseline policies,
    and mints scoped API keys (storing only SHA-256 hashes in the database).
    """
    now = datetime.now(UTC)
    accepted_at = payload.terms_accepted_at or now
    slug = _slugify(payload.company_name)
    tenant_id = f"tnt-{slug}-{secrets.token_hex(4)}"
    registration_id = f"reg_{secrets.token_hex(8)}"

    tenant = Tenant(
        id=tenant_id,
        name=payload.company_name,
        is_demo=False,
        created_at=now,
    )
    session.add(tenant)
    session.flush()

    # Seed mandatory fail-closed baseline policies for the newly provisioned tenant
    for rule in DEFAULT_POLICIES:
        serialized_conditions = [
            condition.model_dump(mode="json") for condition in rule.conditions
        ]
        session.add(
            Policy(
                tenant_id=tenant_id,
                policy_key=rule.policy_key,
                action=rule.action,
                effect=rule.effect.value,
                priority=rule.priority,
                conditions=serialized_conditions,
                summary=rule.summary,
                reason=rule.reason,
                status="active",
                version=rule.version,
                source_channel="onboarding:baseline-v1",
                source_message_id=None,
                authored_by="system:onboarding",
                approved_by="system:onboarding",
                locked_at=now,
                is_demo_fixture=False,
                created_at=now,
            )
        )
        session.add(
            PolicyRevision(
                tenant_id=tenant_id,
                policy_key=rule.policy_key,
                action=rule.action,
                effect=rule.effect.value,
                priority=rule.priority,
                conditions=serialized_conditions,
                summary=rule.summary,
                reason=rule.reason,
                status="active",
                version=rule.version,
                source_channel="onboarding:baseline-v1",
                source_message_id=None,
                source_text="Provisioned during enterprise tenant onboarding.",
                authored_by="system:onboarding",
                approved_by="system:onboarding",
                locked_at=now,
                created_at=now,
                updated_at=now,
            )
        )

    # Mint 3 role-separated API keys; store only SHA-256 digests in DB
    roles_to_mint: tuple[Literal["runtime", "policy_admin", "tenant_admin"], ...] = (
        "runtime",
        "policy_admin",
        "tenant_admin",
    )
    issued_credentials: list[IssuedCredential] = []

    for role in roles_to_mint:
        key_id, raw_secret, presented_token = generate_api_key_material()
        scopes_list = sorted(ROLE_SCOPES[role])
        session.add(
            APIKey(
                key_id=key_id,
                tenant_id=tenant_id,
                name=f"{payload.company_name} ({role})",
                secret_hash=hash_api_key_secret(raw_secret),
                role=role,
                scopes=scopes_list,
                is_active=True,
                created_at=now,
            )
        )
        issued_credentials.append(
            IssuedCredential(
                key_id=key_id,
                role=role,
                scopes=scopes_list,
                api_key=presented_token,
            )
        )

    registration = ClientRegistration(
        registration_id=registration_id,
        company_name=payload.company_name,
        contact_name=payload.contact_name,
        work_email=payload.work_email,
        role_title=payload.role_title,
        agent_framework=payload.agent_framework,
        monthly_action_volume=payload.monthly_action_volume,
        primary_use_case=payload.primary_use_case,
        provisioned_tenant_id=tenant_id,
        status="provisioned",
        created_at=now,
    )
    session.add(registration)
    session.commit()

    return ClientRegistrationResponse(
        registration_id=registration_id,
        company_name=payload.company_name,
        contact_name=payload.contact_name,
        work_email=payload.work_email,
        tenant_id=tenant_id,
        status="provisioned",
        baseline_policies_seeded=len(DEFAULT_POLICIES),
        terms_accepted_at=accepted_at,
        credentials=issued_credentials,
        created_at=now,
        message=(
            "Workspace provisioned in Supabase PostgreSQL. Store these API keys securely; "
            "plaintext secrets are never persisted and cannot be retrieved again."
        ),
    )