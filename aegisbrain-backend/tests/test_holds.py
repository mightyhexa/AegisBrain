"""Integration tests for tenant-scoped HOLD approvals and one-time tokens."""

from __future__ import annotations

from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.db.models import APIKey, HoldAuditEvent, HoldRequest, Tenant
from app.db.seed import seed_demo_data
from app.main import app
from app.security.auth import ROLE_SCOPES, generate_api_key_material, hash_api_key_secret


@pytest.fixture()
def hold_client() -> Generator[dict, None, None]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=test_engine)
    with testing_session_local() as session:
        seed_demo_data(session)

    def override_get_db():
        session = testing_session_local()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    def create_key(tenant_id: str, role: str = "tenant_admin") -> tuple[str, str]:
        key_id, secret, token = generate_api_key_material()
        with testing_session_local() as session:
            if session.get(Tenant, tenant_id) is None:
                session.add(Tenant(id=tenant_id, name=tenant_id, is_demo=False))
                session.flush()
            session.add(APIKey(
                key_id=key_id,
                tenant_id=tenant_id,
                name=f"test-{role}",
                secret_hash=hash_api_key_secret(secret),
                role=role,
                scopes=sorted(ROLE_SCOPES[role]),
                is_active=True,
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            ))
            session.commit()
        return token, key_id

    author, author_id = create_key("demo-tenant")
    reviewer, reviewer_id = create_key("demo-tenant")
    runtime, runtime_id = create_key("demo-tenant", role="runtime")
    other_tenant_admin, other_admin_id = create_key("other-tenant")

    yield {
        "client": client,
        "session_factory": testing_session_local,
        "author": author,
        "author_id": author_id,
        "reviewer": reviewer,
        "reviewer_id": reviewer_id,
        "runtime": runtime,
        "runtime_id": runtime_id,
        "other_tenant_admin": other_tenant_admin,
        "other_admin_id": other_admin_id,
    }
    app.dependency_overrides.clear()
    test_engine.dispose()


def _evaluate(client: TestClient, key: str, request_id: str = "hold-phase3-001", amount: int = 8000):
    return client.post(
        "/v1/evaluate",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "request_id": request_id,
            "agent_id": "support_bot_1",
            "action": "refunds.create",
            "params": {"amount_inr": amount, "customer_id": "customer-42"},
        },
    )


def test_hold_created_idempotently_for_hold_decision(hold_client: dict) -> None:
    client = hold_client["client"]
    first = _evaluate(client, hold_client["author"])
    second = _evaluate(client, hold_client["author"])
    assert first.status_code == second.status_code == 200
    assert first.json()["decision"] == "hold"
    assert first.json()["audit_hash"] == second.json()["audit_hash"]

    with hold_client["session_factory"]() as session:
        assert session.scalar(select(func.count(HoldRequest.id))) == 1
        assert session.scalar(select(func.count(HoldAuditEvent.id))) == 1

    response = client.get(
        "/v1/holds/hold-phase3-001",
        headers={"Authorization": f"Bearer {hold_client['author']}"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    assert len(response.json()["payload_sha256"]) == 64


def test_independent_approval_exact_payload_one_time_use_and_audit(hold_client: dict) -> None:
    client = hold_client["client"]
    request_id = "hold-phase3-002"
    evaluation = _evaluate(client, hold_client["author"], request_id=request_id)
    assert evaluation.status_code == 200 and evaluation.json()["decision"] == "hold"

    headers_author = {"Authorization": f"Bearer {hold_client['author']}"}
    self_approval = client.post(f"/v1/holds/{request_id}/approve", headers=headers_author)
    assert self_approval.status_code == 409

    headers_reviewer = {"Authorization": f"Bearer {hold_client['reviewer']}"}
    approved = client.post(f"/v1/holds/{request_id}/approve", headers=headers_reviewer)
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["status"] == "approved"
    assert body["approved_by_key_id"] == hold_client["reviewer_id"]
    assert body["token_ttl_seconds"] == 300
    token = body["approval_token"]

    with hold_client["session_factory"]() as session:
        stored = session.scalar(select(HoldRequest).where(HoldRequest.request_id == request_id))
        assert stored is not None
        assert stored.approval_token_hash is not None
        assert stored.approval_token_hash != token
        assert len(stored.approval_token_hash) == 64

    consume_headers = {
        "Authorization": f"Bearer {hold_client['runtime']}",
        "X-Aegis-Approval-Token": token,
    }
    changed_payload = client.post(
        f"/v1/holds/{request_id}/consume",
        headers=consume_headers,
        json={"agent_id": "support_bot_1", "action": "refunds.create",
              "params": {"amount_inr": 8001, "customer_id": "customer-42"}},
    )
    assert changed_payload.status_code == 409

    consumed = client.post(
        f"/v1/holds/{request_id}/consume",
        headers=consume_headers,
        json={"agent_id": "support_bot_1", "action": "refunds.create",
              "params": {"amount_inr": 8000, "customer_id": "customer-42"}},
    )
    assert consumed.status_code == 200, consumed.text
    assert consumed.json()["authorized"] is True
    assert consumed.json()["execution"] == "not_performed"
    assert consumed.json()["status"] == "consumed"

    replay = client.post(
        f"/v1/holds/{request_id}/consume",
        headers=consume_headers,
        json={"agent_id": "support_bot_1", "action": "refunds.create",
              "params": {"amount_inr": 8000, "customer_id": "customer-42"}},
    )
    assert replay.status_code == 409

    audit = client.get(
        "/v1/holds/audit/verify",
        headers=headers_reviewer,
    )
    assert audit.status_code == 200, audit.text
    assert audit.json()["valid"] is True
    assert audit.json()["checked_records"] >= 3


def test_expired_token_cannot_be_consumed(hold_client: dict) -> None:
    client = hold_client["client"]
    request_id = "hold-phase3-expired"
    result = _evaluate(client, hold_client["author"], request_id=request_id)
    assert result.status_code == 200
    approval = client.post(
        f"/v1/holds/{request_id}/approve",
        headers={"Authorization": f"Bearer {hold_client['reviewer']}"},
    )
    assert approval.status_code == 200, approval.text
    token = approval.json()["approval_token"]

    with hold_client["session_factory"]() as session:
        row = session.scalar(select(HoldRequest).where(HoldRequest.request_id == request_id))
        assert row is not None
        row.token_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        session.commit()

    response = client.post(
        f"/v1/holds/{request_id}/consume",
        headers={"Authorization": f"Bearer {hold_client['runtime']}",
                 "X-Aegis-Approval-Token": token},
        json={"agent_id": "support_bot_1", "action": "refunds.create",
              "params": {"amount_inr": 8000, "customer_id": "customer-42"}},
    )
    assert response.status_code == 410
    with hold_client["session_factory"]() as session:
        row = session.scalar(select(HoldRequest).where(HoldRequest.request_id == request_id))
        assert row is not None and row.status == "expired"


def test_holds_are_tenant_scoped_and_require_tenant_admin_to_approve(hold_client: dict) -> None:
    client = hold_client["client"]
    request_id = "hold-phase3-isolation"
    assert _evaluate(client, hold_client["author"], request_id=request_id).status_code == 200

    other = client.get(
        f"/v1/holds/{request_id}",
        headers={"Authorization": f"Bearer {hold_client['other_tenant_admin']}"},
    )
    assert other.status_code == 404

    # A runtime credential can evaluate/consume but cannot approve a hold.
    denied = client.post(
        f"/v1/holds/{request_id}/approve",
        headers={"Authorization": f"Bearer {hold_client['runtime']}"},
    )
    assert denied.status_code == 403


def test_bad_token_does_not_consume_valid_approval(hold_client: dict) -> None:
    client = hold_client["client"]
    request_id = "hold-phase3-bad-token"
    assert _evaluate(client, hold_client["author"], request_id=request_id).status_code == 200
    approval = client.post(
        f"/v1/holds/{request_id}/approve",
        headers={"Authorization": f"Bearer {hold_client['reviewer']}"},
    )
    assert approval.status_code == 200

    headers = {"Authorization": f"Bearer {hold_client['runtime']}",
               "X-Aegis-Approval-Token": "aht_not-the-valid-token-string"}
    bad = client.post(
        f"/v1/holds/{request_id}/consume",
        headers=headers,
        json={"agent_id": "support_bot_1", "action": "refunds.create",
              "params": {"amount_inr": 8000, "customer_id": "customer-42"}},
    )
    assert bad.status_code == 401
    with hold_client["session_factory"]() as session:
        row = session.scalar(select(HoldRequest).where(HoldRequest.request_id == request_id))
        assert row is not None and row.status == "approved"
