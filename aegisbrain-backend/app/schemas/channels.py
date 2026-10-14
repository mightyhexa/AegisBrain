"""Pydantic contracts for Slack, WhatsApp, and Gmail manager channel ingestion."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.policy_lifecycle import PolicyRevisionResponse

ChannelProvider = Literal["slack", "whatsapp", "gmail"]


class ChannelConnectRequest(BaseModel):
    """Registers an authorized manager communication channel for policy ingestion."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    provider: ChannelProvider
    channel_target: str = Field(
        min_length=2,
        max_length=200,
        description="Channel handle, e.g., #ops-policies, +919876543210, or ops-lead@company.com",
    )
    display_name: str = Field(min_length=2, max_length=200)
    authorized_managers: list[str] = Field(
        min_length=1,
        max_length=50,
        description="List of manager emails, Slack handles, or phone numbers allowed to propose rules",
    )


class ChannelConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    tenant_id: str
    provider: ChannelProvider
    channel_target: str
    display_name: str
    authorized_managers: list[str]
    status: Literal["connected", "paused"]
    created_at: datetime


class ChannelMessageIngestRequest(BaseModel):
    """Inbound manager directive from Slack, WhatsApp, or Gmail."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    provider: ChannelProvider
    channel_target: str = Field(min_length=2, max_length=200)
    sender_identifier: str = Field(
        min_length=2,
        max_length=200,
        description="Manager handle, phone number, or email address",
    )
    message_text: str = Field(
        min_length=8,
        max_length=4000,
        description="Plain-English policy instruction from the manager",
    )
    external_message_id: str | None = Field(default=None, max_length=200)


class ChannelIngestResponse(BaseModel):
    """Result of compiling a manager chat/email directive into a staged AST policy draft."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["draft_staged"]
    provider: ChannelProvider
    channel_target: str
    sender_verified: str
    compiled_ast: dict[str, Any]
    draft: PolicyRevisionResponse
    message: str