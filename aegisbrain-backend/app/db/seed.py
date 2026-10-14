"""Initialize the local database and seed synthetic demo policies."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import Base, engine
from app.db.models import Policy, PolicyRevision, Tenant
from app.engine.policies import DEFAULT_POLICIES


def initialize_database() -> None:
    """Registers all ORM models and idempotently seeds baseline demo fixtures."""
    Base.metadata.create_all(bind=engine)
    with Session(engine, autoflush=False, expire_on_commit=False) as session:
        seed_demo_data(session)


def seed_demo_data(session: Session) -> None:
    """Seeds the demo tenant, active baseline policies, and initial revision snapshots."""
    tenant = session.get(Tenant, settings.demo_tenant_id)
    if tenant is None:
        tenant = Tenant(
            id=settings.demo_tenant_id,
            name="AegisBrain Local Demo",
            is_demo=True,
        )
        session.add(tenant)
        session.flush()

    existing_keys = set(
        session.scalars(
            select(Policy.policy_key).where(
                Policy.tenant_id == settings.demo_tenant_id
            )
        ).all()
    )
    now = datetime.now(UTC)

    for rule in DEFAULT_POLICIES:
        if rule.policy_key in existing_keys:
            continue
        serialized_conditions = [
            condition.model_dump(mode="json") for condition in rule.conditions
        ]
        session.add(
            Policy(
                tenant_id=settings.demo_tenant_id,
                policy_key=rule.policy_key,
                action=rule.action,
                effect=rule.effect.value,
                priority=rule.priority,
                conditions=serialized_conditions,
                summary=rule.summary,
                reason=rule.reason,
                status="active",
                version=rule.version,
                source_channel="seed:local-demo",
                source_message_id=None,
                authored_by="system:demo-seed",
                approved_by="system:demo-seed",
                locked_at=now,
                is_demo_fixture=True,
            )
        )
    session.commit()

    # Idempotently snapshot already-published policy rows into the revision
    # history when the lifecycle table is initialized.
    active_rows = session.scalars(
        select(Policy).where(
            Policy.status == "active",
            Policy.locked_at.is_not(None),
        )
    ).all()
    for policy in active_rows:
        existing_revision = session.scalar(
            select(PolicyRevision.id).where(
                PolicyRevision.tenant_id == policy.tenant_id,
                PolicyRevision.policy_key == policy.policy_key,
                PolicyRevision.version == policy.version,
            )
        )
        if existing_revision is not None:
            continue
        session.add(
            PolicyRevision(
                tenant_id=policy.tenant_id,
                policy_key=policy.policy_key,
                action=policy.action,
                effect=policy.effect,
                priority=policy.priority,
                conditions=policy.conditions,
                summary=policy.summary,
                reason=policy.reason,
                status="active",
                version=policy.version,
                source_channel=policy.source_channel,
                source_message_id=policy.source_message_id,
                source_text=None,
                authored_by=policy.authored_by or "legacy:unknown-author",
                approved_by=policy.approved_by or "legacy:unknown-approver",
                locked_at=policy.locked_at,
                created_at=policy.created_at,
            )
        )
    session.commit()