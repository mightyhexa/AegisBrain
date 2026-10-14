"""Pydantic contracts for B2B client registration and workspace provisioning."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL_PATTERN = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"


class ClientRegistrationRequest(BaseModel):
    """Payload submitted by B2B clients requesting a gateway workspace."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    company_name: str = Field(min_length=2, max_length=200)
    contact_name: str = Field(default="Authorized Signatory", min_length=2, max_length=200)
    work_email: str = Field(min_length=5, max_length=254, pattern=_EMAIL_PATTERN)
    role_title: str = Field(default="Engineering Lead", min_length=2, max_length=120)
    agent_framework: str = Field(
        default="LangChain / Custom REST", min_length=2, max_length=120
    )
    monthly_action_volume: str = Field(
        default="50k - 500k", min_length=2, max_length=64
    )
    primary_use_case: str = Field(
        default="Refund and promo discount governance for autonomous agents",
        min_length=3,
        max_length=2000,
    )
    terms_accepted_at: datetime | None = Field(default=None)

    @field_validator("work_email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class IssuedCredential(BaseModel):
    """One-time plaintext API key display object."""

    model_config = ConfigDict(extra="forbid")

    key_id: str
    role: Literal["runtime", "policy_admin", "tenant_admin"]
    scopes: list[str]
    api_key: str
    storage_mode: Literal["sha256_hash_only"] = "sha256_hash_only"


class ClientRegistrationResponse(BaseModel):
    """Returned once upon successful workspace registration and key generation."""

    model_config = ConfigDict(extra="forbid")

    registration_id: str
    company_name: str
    contact_name: str
    work_email: str
    tenant_id: str
    status: Literal["provisioned"]
    baseline_policies_seeded: int
    terms_accepted_at: datetime
    credentials: list[IssuedCredential]
    created_at: datetime
    message: str