"""HTTP request and response contracts for POST /v1/evaluate."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

_IDENTIFIER = r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$"
_ACTION = r"^[a-z][a-z0-9_.-]*$"


class EvaluateRequest(BaseModel):
    """Matches the payload sent by the frontend playground and agent SDKs."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    request_id: str = Field(min_length=1, max_length=200, pattern=_IDENTIFIER)
    agent_id: str = Field(min_length=1, max_length=128, pattern=_IDENTIFIER)
    action: str = Field(min_length=1, max_length=128, pattern=_ACTION)
    params: dict[str, JsonValue] = Field(default_factory=dict, max_length=100)


class EvaluateResponse(BaseModel):
    """Response contract consumed by the frontend playground and SDKs."""

    model_config = ConfigDict(extra="forbid")

    request_id: str
    decision: Literal["allow", "hold", "deny"]
    policy_key: str | None
    reason: str
    evaluated_at: datetime
    latency_ms: float = Field(ge=0)
    audit_hash: str


class DecisionRecordResponse(BaseModel):
    """Recent audited decision item for the live telemetry feed."""

    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    request_id: str
    agent_id: str
    action: str
    params: dict[str, Any]
    verdict: Literal["ALLOW", "HOLD", "DENY"]
    policy_key: str | None
    policy_version: int | None
    reason: str
    engine_latency_ms: float
    evaluated_at: datetime
    prev_hash: str
    hash: str


class ActivePolicyResponse(BaseModel):
    policy_key: str
    action: str
    effect: Literal["ALLOW", "HOLD", "DENY"]
    priority: int
    version: int
    summary: str
    reason: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    environment: str