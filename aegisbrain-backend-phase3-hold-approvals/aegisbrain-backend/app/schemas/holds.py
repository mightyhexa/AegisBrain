"""Pydantic contracts for HOLD approval and one-time tokens."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class HoldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    request_id: str
    agent_id: str
    action: str
    params: dict[str, JsonValue]
    payload_sha256: str
    decision_hash: str
    policy_key: str | None
    policy_version: int | None
    reason: str
    requested_by_key_id: str | None
    status: Literal["pending", "approved", "consumed", "expired"]
    approved_by_key_id: str | None
    approved_at: datetime | None
    token_expires_at: datetime | None
    token_used_at: datetime | None
    created_at: datetime
    updated_at: datetime


class HoldApprovalResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str
    status: Literal["approved"]
    approved_by_key_id: str
    approved_at: datetime
    token_expires_at: datetime
    token_ttl_seconds: int = Field(gt=0)
    approval_token: str = Field(min_length=20)
    token_storage: Literal["sha256_digest_only"]
    payload_sha256: str


class HoldConsumeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    agent_id: str = Field(min_length=1, max_length=128)
    action: str = Field(min_length=1, max_length=128, pattern=r"^[a-z][a-z0-9_.-]*$")
    params: dict[str, JsonValue] = Field(default_factory=dict, max_length=100)


class HoldConsumeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    authorized: Literal[True]
    request_id: str
    status: Literal["consumed"]
    payload_sha256: str
    consumed_at: datetime
    execution: Literal["not_performed"]
    message: str


class HoldAuditVerificationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool
    checked_records: int
    failed_event_id: int | None
    reason: str
    last_hash: str
