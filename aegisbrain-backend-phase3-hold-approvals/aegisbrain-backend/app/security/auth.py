"""Tenant-bound API-key authentication and scope authorization.

Local development intentionally allows credential-free access only to the
configured demo tenant so the marketing playground keeps working. That bypass
is unavailable outside APP_ENV=development. Real API keys always resolve the
tenant from the server-side key record; clients cannot select their tenant.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, FrozenSet

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.db.models import APIKey

_KEY_PATTERN = re.compile(r"^abk_([0-9a-f]{16})\.([A-Za-z0-9_-]{43})$")

ROLE_SCOPES: dict[str, frozenset[str]] = {
    "runtime": frozenset({"gateway:evaluate"}),
    "policy_reader": frozenset({"policies:read", "audit:read"}),
    "policy_admin": frozenset({"policies:read", "audit:read", "policies:write"}),
    "tenant_admin": frozenset(
        {"gateway:evaluate", "policies:read", "audit:read", "policies:write", "workspace:admin"}
    ),
}

DEVELOPMENT_DEMO_SCOPES = frozenset({"gateway:evaluate", "policies:read", "audit:read"})


@dataclass(frozen=True, slots=True)
class Principal:
    """Authenticated identity derived from an API-key record or local demo mode."""

    tenant_id: str
    key_id: str | None
    role: str
    scopes: FrozenSet[str]
    is_development_demo: bool = False


def hash_api_key_secret(secret: str) -> str:
    """Hash a high-entropy generated API-key secret for database storage."""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def generate_api_key_material() -> tuple[str, str, str]:
    """Return (key_id, secret, presented_token); persist only a hash of secret."""
    key_id = secrets.token_hex(8)
    secret = secrets.token_urlsafe(32)
    return key_id, secret, f"abk_{key_id}.{secret}"


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="A valid AegisBrain API key is required.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_principal(request: Request, session: Session = Depends(get_db)) -> Principal:
    """Authenticate the caller and derive the tenant exclusively from storage."""
    authorization = request.headers.get("Authorization")

    # Backwards-compatible local browser demo. This is intentionally impossible
    # in test/production environments and is restricted to the configured demo tenant.
    if not authorization:
        if settings.app_env == "development":
            return Principal(
                tenant_id=settings.demo_tenant_id,
                key_id=None,
                role="development_demo",
                scopes=DEVELOPMENT_DEMO_SCOPES,
                is_development_demo=True,
            )
        raise _unauthorized()

    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token:
        raise _unauthorized()

    match = _KEY_PATTERN.fullmatch(token)
    if match is None:
        raise _unauthorized()

    key_id, supplied_secret = match.groups()
    record = session.get(APIKey, key_id)
    if record is None or not hmac.compare_digest(record.secret_hash, hash_api_key_secret(supplied_secret)):
        raise _unauthorized()

    now = datetime.now(timezone.utc)
    if record.revoked_at is not None or not record.is_active:
        raise _unauthorized()
    if record.expires_at is not None:
        expires_at = record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            raise _unauthorized()

    # Validate stored authorization data, too: malformed DB state never widens access.
    if not isinstance(record.scopes, list) or record.role not in ROLE_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API-key authorization configuration is invalid.",
        )
    scopes = frozenset(scope for scope in record.scopes if isinstance(scope, str))
    if len(scopes) != len(record.scopes) or not scopes.issubset(ROLE_SCOPES[record.role]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API-key authorization configuration is invalid.",
        )

    record.last_used_at = now
    session.commit()
    return Principal(
        tenant_id=record.tenant_id,
        key_id=record.key_id,
        role=record.role,
        scopes=scopes,
        is_development_demo=False,
    )


def require_scope(required_scope: str) -> Callable[..., Principal]:
    """Build a FastAPI dependency which enforces one explicit permission."""

    def dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if required_scope not in principal.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This API key does not have the required scope: {required_scope}.",
            )
        return principal

    return dependency
