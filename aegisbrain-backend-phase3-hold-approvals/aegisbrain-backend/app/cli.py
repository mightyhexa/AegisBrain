"""Local operator commands for tenant and API-key provisioning.

Run with: python -m app.cli --help
API-key plaintext is printed once at creation. Store it in a secret manager.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.db.models import APIKey, Tenant
from app.db.seed import initialize_database
from app.security.auth import ROLE_SCOPES, generate_api_key_material, hash_api_key_secret

_TENANT_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{2,63}$")


def _create_tenant(args: argparse.Namespace) -> int:
    if not _TENANT_ID_PATTERN.fullmatch(args.tenant_id):
        print("ERROR: tenant-id must be 3-64 lowercase letters, digits, '-' or '_'.", file=sys.stderr)
        return 2
    name = args.name.strip()
    if not name or len(name) > 200:
        print("ERROR: tenant name must contain 1-200 non-whitespace characters.", file=sys.stderr)
        return 2

    with SessionLocal() as session:
        if session.get(Tenant, args.tenant_id) is not None:
            print(f"ERROR: tenant already exists: {args.tenant_id}", file=sys.stderr)
            return 2
        session.add(Tenant(id=args.tenant_id, name=name, is_demo=False))
        session.commit()
    print(f"Tenant created: {args.tenant_id}")
    print("No policies were activated. Evaluation will fail closed until an approved baseline policy bundle exists.")
    return 0


def _create_api_key(args: argparse.Namespace) -> int:
    if args.role not in ROLE_SCOPES:
        print(f"ERROR: unsupported role: {args.role}", file=sys.stderr)
        return 2
    if args.expires_days < 1 or args.expires_days > 3650:
        print("ERROR: expires-days must be between 1 and 3650.", file=sys.stderr)
        return 2
    name = args.name.strip()
    if not name or len(name) > 100:
        print("ERROR: key name must contain 1-100 non-whitespace characters.", file=sys.stderr)
        return 2

    key_id, secret, presented_token = generate_api_key_material()
    expires_at = datetime.now(timezone.utc) + timedelta(days=args.expires_days)
    with SessionLocal() as session:
        tenant = session.get(Tenant, args.tenant_id)
        if tenant is None:
            print(f"ERROR: tenant does not exist: {args.tenant_id}", file=sys.stderr)
            return 2
        session.add(
            APIKey(
                key_id=key_id,
                tenant_id=tenant.id,
                name=name,
                secret_hash=hash_api_key_secret(secret),
                role=args.role,
                scopes=sorted(ROLE_SCOPES[args.role]),
                is_active=True,
                expires_at=expires_at,
            )
        )
        session.commit()

    print("API key created. Copy it now; the plaintext secret will not be shown again.")
    print(f"Tenant: {args.tenant_id}")
    print(f"Key ID: {key_id}")
    print(f"Role: {args.role}")
    print(f"Expires: {expires_at.isoformat()}")
    print(f"API key: {presented_token}")
    return 0


def _revoke_api_key(args: argparse.Namespace) -> int:
    with SessionLocal() as session:
        record = session.get(APIKey, args.key_id)
        if record is None:
            print(f"ERROR: API key not found: {args.key_id}", file=sys.stderr)
            return 2
        if record.revoked_at is not None:
            print(f"API key is already revoked: {args.key_id}")
            return 0
        record.is_active = False
        record.revoked_at = datetime.now(timezone.utc)
        session.commit()
    print(f"API key revoked: {args.key_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="AegisBrain local tenant/API-key administration")
    subparsers = parser.add_subparsers(dest="command", required=True)

    tenant = subparsers.add_parser("create-tenant", help="Create a tenant without active policies")
    tenant.add_argument("--tenant-id", required=True)
    tenant.add_argument("--name", required=True)
    tenant.set_defaults(handler=_create_tenant)

    create_key = subparsers.add_parser("create-api-key", help="Create a tenant-bound API key")
    create_key.add_argument("--tenant-id", required=True)
    create_key.add_argument("--name", required=True)
    create_key.add_argument("--role", choices=sorted(ROLE_SCOPES), required=True)
    create_key.add_argument("--expires-days", type=int, default=90)
    create_key.set_defaults(handler=_create_api_key)

    revoke_key = subparsers.add_parser("revoke-api-key", help="Revoke an API key by key ID")
    revoke_key.add_argument("--key-id", required=True)
    revoke_key.set_defaults(handler=_revoke_api_key)

    args = parser.parse_args()
    initialize_database()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
