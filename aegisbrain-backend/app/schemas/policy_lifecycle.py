"""API contracts for draft, review, lock, and policy-version history."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.policy import Condition, PolicyRule, Verdict

_POLICY_KEY = r"^[A-Za-z0-9_.:-]+$"
_ACTION = r"^[a-z][a-z0-9_.-]*$"


class PolicyDraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    policy_key: str = Field(min_length=1, max_length=128, pattern=_POLICY_KEY)
    action: str = Field(min_length=1, max_length=128, pattern=_ACTION)
    effect: Verdict
    priority: int = Field(ge=0, le=1_000_000)
    conditions: list[Condition] = Field(default_factory=list, max_length=64)
    summary: str = Field(min_length=1, max_length=500)
    reason: str = Field(min_length=1, max_length=2_000)
    source_channel: str | None = Field(default=None, max_length=200)
    source_message_id: str | None = Field(default=None, max_length=200)
    source_text: str | None = Field(default=None, max_length=10_000)

    @model_validator(mode="after")
    def validate_as_policy_ast(self) -> Self:
        # Reuse the evaluator's canonical schema so drafts cannot bypass AST validation.
        PolicyRule.model_validate(
            {
                "policy_key": self.policy_key,
                "action": self.action,
                "effect": self.effect,
                "priority": self.priority,
                "conditions": self.conditions,
                "summary": self.summary,
                "reason": self.reason,
                "version": 1,
                "status": "active",
            }
        )
        return self


class PolicyDraftPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    action: str | None = Field(
        default=None, min_length=1, max_length=128, pattern=_ACTION
    )
    effect: Verdict | None = None
    priority: int | None = Field(default=None, ge=0, le=1_000_000)
    conditions: list[Condition] | None = Field(default=None, max_length=64)
    summary: str | None = Field(default=None, min_length=1, max_length=500)
    reason: str | None = Field(default=None, min_length=1, max_length=2_000)
    source_channel: str | None = Field(default=None, max_length=200)
    source_message_id: str | None = Field(default=None, max_length=200)
    source_text: str | None = Field(default=None, max_length=10_000)


class PolicyRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: str
    policy_key: str
    action: str
    effect: Literal["ALLOW", "HOLD", "DENY"]
    priority: int
    conditions: list[dict[str, Any]]
    summary: str
    reason: str
    status: Literal["draft", "active", "superseded", "rejected"]
    version: int
    source_channel: str | None
    source_message_id: str | None
    source_text: str | None
    authored_by: str | None
    approved_by: str | None
    rejected_by: str | None
    rejection_reason: str | None
    locked_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PolicyRejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: str = Field(min_length=3, max_length=1000)


class PolicyLifecycleEventSummary(BaseModel):
    id: int
    event_type: str
    policy_key: str
    policy_version: int
    actor_key_id: str
    occurred_at: datetime
    hash: str


class PolicyLifecycleVerificationResponse(BaseModel):
    valid: bool
    checked_records: int
    failed_event_id: int | None
    reason: str
    last_hash: str


class PolicyHistoryResponse(BaseModel):
    policy_key: str
    revisions: list[PolicyRevisionResponse]