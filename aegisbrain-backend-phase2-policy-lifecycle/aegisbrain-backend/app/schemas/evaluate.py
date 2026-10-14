"""HTTP request and response contracts for POST /v1/evaluate."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


_IDENTIFIER = r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$"
_ACTION = r"^[a-z][a-z0-9_.-]*$"


class EvaluateRequest(BaseModel):
    """Matches the payload currently sent by the frontend playground."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    request_id: str = Field(min_length=1, max_length=200, pattern=_IDENTIFIER)
    agent_id: str = Field(min_length=1, max_length=128, pattern=_IDENTIFIER)
    action: str = Field(min_length=1, max_length=128, pattern=_ACTION)
    params: dict[str, JsonValue] = Field(default_factory=dict, max_length=100)


class EvaluateResponse(BaseModel):
    """Response intentionally matches the fields consumed by page.tsx.

    The frontend reads decision, policy_key, and reason. Additional fields are
    included for diagnostics and audit correlation and are backward-compatible.
    """

    model_config = ConfigDict(extra="forbid")

    request_id: str
    decision: Literal["allow", "hold", "deny"]
    policy_key: str | None
    reason: str
    evaluated_at: datetime
    latency_ms: float = Field(ge=0)
    audit_hash: str


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
