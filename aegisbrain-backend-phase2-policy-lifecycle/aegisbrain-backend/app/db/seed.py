"""Initialize the local database and seed synthetic demo policies."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import Base, engine
from app.db.models import Policy, PolicyRevision, Tenant
from app.engine.policies import DEFAULT_POLICIES


def initialize_database() -> None:
    # Importing models above registers all mapped tables with Base.metadata.
    Base.metadata.create_all(bind=engine)
    with Session(engine, autoflush=False, expire_on_commit=False) as session:
        seed_demo_data(session)


def seed_demo_data(session: Session) -> None:
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
            select(Policy.policy_key).where(Policy.tenant_id == settings.demo_tenant_id)
        ).all()
    )
    now = datetime.now(timezone.utc)

    for rule in DEFAULT_POLICIES:
        if rule.policy_key in existing_keys:
            continue
        session.add(
            Policy(
                tenant_id=settings.demo_tenant_id,
                policy_key=rule.policy_key,
                action=rule.action,
                effect=rule.effect.value,
                priority=rule.priority,
                conditions=[condition.model_dump(mode="json") for condition in rule.conditions],
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
    # history when the new lifecycle table is first introduced. Existing data
    # is preserved; this is additive and works against an existing SQLite DB.
    active_rows = session.scalars(
        select(Policy).where(Policy.status == "active", Policy.locked_at.is_not(None))
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
