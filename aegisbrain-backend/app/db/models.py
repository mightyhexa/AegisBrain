"""SQLAlchemy models for tenants, API credentials, policies, decisions, and onboarding."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def utc_now() -> datetime:
    """Returns current timezone-aware UTC timestamp."""
    return datetime.now(UTC)


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class APIKey(Base):
    """One tenant-bound API credential; plaintext secrets are never stored."""

    __tablename__ = "api_keys"
    __table_args__ = (
        Index("ix_api_keys_tenant_active", "tenant_id", "is_active"),
    )

    key_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    secret_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    scopes: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Policy(Base):
    __tablename__ = "policies"
    __table_args__ = (
        UniqueConstraint("tenant_id", "policy_key", name="uq_policy_tenant_key"),
        Index("ix_policies_tenant_action_status", "tenant_id", "action", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    policy_key: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    effect: Mapped[str] = mapped_column(String(8), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    conditions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source_channel: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_message_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    authored_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_demo_fixture: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class Decision(Base):
    __tablename__ = "decisions"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "request_id", name="uq_decision_tenant_request"
        ),
        Index("ix_decisions_tenant_created", "tenant_id", "evaluated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[str] = mapped_column(String(200), nullable=False)
    agent_id: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    verdict: Mapped[str] = mapped_column(String(8), nullable=False)
    policy_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    policy_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    engine_latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)


class HoldRequest(Base):
    """Tenant-scoped approval state for a deterministic HOLD decision."""

    __tablename__ = "hold_requests"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_hold_tenant_request"),
        Index(
            "ix_hold_tenant_status_created", "tenant_id", "status", "created_at"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[str] = mapped_column(String(200), nullable=False)
    agent_id: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    payload_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    decision_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    policy_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    policy_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    requested_by_key_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    approved_by_key_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approval_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    token_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )


class HoldAuditEvent(Base):
    """Hash-chained audit event for HOLD request, approval and token use."""

    __tablename__ = "hold_audit_events"
    __table_args__ = (
        Index("ix_hold_audit_tenant_id", "tenant_id", "id"),
        Index("ix_hold_audit_tenant_request", "tenant_id", "request_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[str] = mapped_column(String(200), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_key_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payload_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)


class PolicyRevision(Base):
    """Versioned policy draft/review history; revisions are tenant-scoped snapshots."""

    __tablename__ = "policy_revisions"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "policy_key",
            "version",
            name="uq_policy_revision_tenant_key_version",
        ),
        Index("ix_policy_revisions_tenant_status", "tenant_id", "status"),
        Index("ix_policy_revisions_tenant_key", "tenant_id", "policy_key", "version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    policy_key: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    effect: Mapped[str] = mapped_column(String(8), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    conditions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    source_channel: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_message_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    authored_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rejected_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )


class PolicyLifecycleEvent(Base):
    """Hash-chained provenance event for policy lifecycle transitions."""

    __tablename__ = "policy_lifecycle_events"
    __table_args__ = (
        Index("ix_policy_lifecycle_tenant_id", "tenant_id", "id"),
        Index("ix_policy_lifecycle_tenant_key", "tenant_id", "policy_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    policy_key: Mapped[str] = mapped_column(String(128), nullable=False)
    policy_version: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_key_id: Mapped[str] = mapped_column(String(32), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)


class ClientRegistration(Base):
    """Enterprise client onboarding record and provisioned tenant reference."""

    __tablename__ = "client_registrations"
    __table_args__ = (
        Index("ix_client_registrations_email", "work_email"),
        Index("ix_client_registrations_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    registration_id: Mapped[str] = mapped_column(
        String(32), nullable=False, unique=True
    )
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(200), nullable=False)
    work_email: Mapped[str] = mapped_column(String(254), nullable=False)
    role_title: Mapped[str] = mapped_column(String(120), nullable=False)
    agent_framework: Mapped[str] = mapped_column(String(120), nullable=False)
    monthly_action_volume: Mapped[str] = mapped_column(String(64), nullable=False)
    primary_use_case: Mapped[str] = mapped_column(Text, nullable=False)
    provisioned_tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="provisioned"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class ChannelConnection(Base):
    """Tenant-scoped manager communication channel (Slack, WhatsApp, Gmail)."""

    __tablename__ = "channel_connections"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "provider",
            "channel_target",
            name="uq_channel_tenant_provider_target",
        ),
        Index("ix_channel_tenant_provider", "tenant_id", "provider"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    channel_target: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    authorized_managers: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="connected"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )