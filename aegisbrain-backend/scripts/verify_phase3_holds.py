"""Run a live Phase 3 HOLD lifecycle smoke test without typing API keys.

Run from the backend directory while local FastAPI is already running:
    python scripts/verify_phase3_holds.py

The script creates three short-lived test credentials in the configured local
SQLite database, uses their token material only in memory, and revokes them on
exit. It leaves test HOLD/audit records behind intentionally for local audit
inspection. It never prints plaintext API keys.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Import main first so every ORM model, including Phase 3 tables, is registered.
from app.main import app as _app  # noqa: E402,F401
from app.config import settings  # noqa: E402
from app.db.database import SessionLocal  # noqa: E402
from app.db.models import APIKey, Tenant  # noqa: E402
from app.db.seed import initialize_database  # noqa: E402
from app.security.auth import ROLE_SCOPES, generate_api_key_material, hash_api_key_secret  # noqa: E402

BASE_URL = os.environ.get("AEGISBRAIN_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def create_ephemeral_key(name: str, role: str) -> tuple[str, str]:
    key_id, secret, token = generate_api_key_material()
    with SessionLocal() as session:
        tenant = session.get(Tenant, settings.demo_tenant_id)
        if tenant is None:
            raise RuntimeError(f"Configured demo tenant does not exist: {settings.demo_tenant_id}")
        session.add(APIKey(
            key_id=key_id,
            tenant_id=tenant.id,
            name=name,
            secret_hash=hash_api_key_secret(secret),
            role=role,
            scopes=sorted(ROLE_SCOPES[role]),
            is_active=True,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        session.commit()
    return key_id, token


def revoke_key(key_id: str) -> None:
    with SessionLocal() as session:
        row = session.get(APIKey, key_id)
        if row is not None and row.revoked_at is None:
            row.is_active = False
            row.revoked_at = datetime.now(timezone.utc)
            session.commit()


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> int:
    initialize_database()
    try:
        health = httpx.get(f"{BASE_URL}/healthz", timeout=3.0, trust_env=False)
        health.raise_for_status()
    except Exception as exc:
        print("FAIL: FastAPI is not reachable at http://127.0.0.1:8000.")
        print("Start it from the aegisbrain-backend folder and rerun this script.")
        print(f"Detail: {exc}")
        return 2

    key_ids: list[str] = []
    client = httpx.Client(base_url=BASE_URL, timeout=5.0, trust_env=False)
    try:
        author_id, author = create_ephemeral_key("phase3-smoke-author", "tenant_admin")
        key_ids.append(author_id)
        reviewer_id, reviewer = create_ephemeral_key("phase3-smoke-reviewer", "tenant_admin")
        key_ids.append(reviewer_id)
        runtime_id, runtime = create_ephemeral_key("phase3-smoke-runtime", "runtime")
        key_ids.append(runtime_id)

        request_id = f"phase3-live-{uuid.uuid4().hex}"
        action_body = {
            "request_id": request_id,
            "agent_id": "phase3_smoke_agent",
            "action": "refunds.create",
            "params": {"amount_inr": 8000, "customer_id": "phase3-smoke-customer"},
        }
        print("1/7 Evaluate a HOLD action...")
        evaluated = client.post("/v1/evaluate", headers={"Authorization": f"Bearer {author}"}, json=action_body)
        expect(evaluated.status_code == 200, f"evaluation failed: HTTP {evaluated.status_code}: {evaluated.text}")
        expect(evaluated.json().get("decision") == "hold", "expected deterministic HOLD decision")
        print("    PASS: request was held and audited")

        print("2/7 Read the tenant-scoped hold record...")
        hold_response = client.get(f"/v1/holds/{request_id}", headers={"Authorization": f"Bearer {author}"})
        expect(hold_response.status_code == 200, f"hold retrieval failed: HTTP {hold_response.status_code}: {hold_response.text}")
        expect(hold_response.json().get("status") == "pending", "new HOLD did not start pending")
        payload_hash = hold_response.json().get("payload_sha256")
        expect(isinstance(payload_hash, str) and len(payload_hash) == 64, "invalid canonical payload digest")
        print("    PASS: pending hold and SHA-256 payload digest exist")

        print("3/7 Reject self-approval...")
        self_approval = client.post(f"/v1/holds/{request_id}/approve", headers={"Authorization": f"Bearer {author}"})
        expect(self_approval.status_code == 409, f"self-approval should return 409, got {self_approval.status_code}: {self_approval.text}")
        print("    PASS: requester cannot approve its own hold")

        print("4/7 Approve using an independent tenant_admin key...")
        approved = client.post(f"/v1/holds/{request_id}/approve", headers={"Authorization": f"Bearer {reviewer}"})
        expect(approved.status_code == 200, f"independent approval failed: HTTP {approved.status_code}: {approved.text}")
        approval_data = approved.json()
        token = approval_data.get("approval_token")
        expect(isinstance(token, str) and token.startswith("aht_"), "approval response did not include a token")
        expect(approval_data.get("approved_by_key_id") == reviewer_id, "wrong reviewer attribution")
        expect(approval_data.get("payload_sha256") == payload_hash, "approval is not bound to hold payload digest")
        print("    PASS: one-time token issued with a 300-second TTL (token hidden)")

        consume_headers = {
            "Authorization": f"Bearer {runtime}",
            "X-Aegis-Approval-Token": token,
        }
        exact_payload = {
            "agent_id": action_body["agent_id"],
            "action": action_body["action"],
            "params": action_body["params"],
        }
        print("5/7 Reject any payload discrepancy without consuming the token...")
        tampered_payload = {**exact_payload, "params": {**exact_payload["params"], "amount_inr": 8001}}
        tampered = client.post(f"/v1/holds/{request_id}/consume", headers=consume_headers, json=tampered_payload)
        expect(tampered.status_code == 409, f"tampered payload should return 409, got {tampered.status_code}: {tampered.text}")
        print("    PASS: altered amount was rejected")

        print("6/7 Consume exact payload then reject replay...")
        consumed = client.post(f"/v1/holds/{request_id}/consume", headers=consume_headers, json=exact_payload)
        expect(consumed.status_code == 200, f"exact consume failed: HTTP {consumed.status_code}: {consumed.text}")
        expect(consumed.json().get("execution") == "not_performed", "endpoint must not claim a downstream tool was executed")
        replay = client.post(f"/v1/holds/{request_id}/consume", headers=consume_headers, json=exact_payload)
        expect(replay.status_code == 409, f"token replay should return 409, got {replay.status_code}: {replay.text}")
        print("    PASS: exact payload consumed once; replay blocked")

        print("7/7 Verify HOLD approval audit chain...")
        audit = client.get("/v1/holds/audit/verify", headers={"Authorization": f"Bearer {reviewer}"})
        expect(audit.status_code == 200, f"audit verification failed: HTTP {audit.status_code}: {audit.text}")
        expect(audit.json().get("valid") is True, f"HOLD audit chain invalid: {audit.text}")
        print(f"    PASS: {audit.json().get('checked_records')} HOLD audit event(s), chain valid")
        print("\nALL PHASE 3 HOLD CHECKS PASSED.")
        print("Note: token consumption proves authorization only; no external/downstream action was executed.")
        return 0
    except Exception as exc:
        print(f"\nPHASE 3 CHECK FAILED: {exc}")
        return 1
    finally:
        client.close()
        for key_id in key_ids:
            revoke_key(key_id)
        if key_ids:
            print("Temporary test API keys revoked.")


if __name__ == "__main__":
    raise SystemExit(main())
