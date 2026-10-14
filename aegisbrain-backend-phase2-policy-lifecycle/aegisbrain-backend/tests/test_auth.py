"""Integration tests for API-key authentication and tenant-scoped reads."""

from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.db.models import APIKey, Policy, Tenant
from app.db.seed import seed_demo_data
from app.main import app
from app.security.auth import ROLE_SCOPES, generate_api_key_material, hash_api_key_secret


@pytest.fixture()
def auth_client() -> Generator[TestClient, None, None]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=test_engine)
    with testing_session() as session:
        seed_demo_data(session)

    def override_get_db():
        session = testing_session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    test_engine.dispose()


def create_tenant_and_key(role: str = "tenant_admin", expires_at=None) -> tuple[str, str]:
    """Create an isolated tenant/key in the active test database."""
    from app.db.database import get_db as configured_get_db

    # Tests call this helper only after auth_client installed its DB override.
    generator = app.dependency_overrides[configured_get_db]()
    session = next(generator)
    try:
        tenant_id = f"tenant-{role.replace('_', '-')}-{role[-1]}"
        suffix = 1
        base_id = tenant_id
        while session.get(Tenant, tenant_id) is not None:
            suffix += 1
            tenant_id = f"{base_id}-{suffix}"
        session.add(Tenant(id=tenant_id, name="Isolated Test Tenant", is_demo=False))
        key_id, secret, presented = generate_api_key_material()
        session.add(
            APIKey(
                key_id=key_id,
                tenant_id=tenant_id,
                name="test key",
                secret_hash=hash_api_key_secret(secret),
                role=role,
                scopes=sorted(ROLE_SCOPES[role]),
                is_active=True,
                expires_at=expires_at,
            )
        )
        session.commit()
        return tenant_id, presented
    finally:
        try:
            next(generator)
        except StopIteration:
            pass


def test_invalid_authorization_does_not_fall_back_to_demo(auth_client: TestClient) -> None:
    response = auth_client.get(
        "/v1/active-policies",
        headers={"Authorization": "Bearer abk_0000000000000000.not-a-real-secret"},
    )
    assert response.status_code == 401


def test_runtime_key_cannot_read_policies(auth_client: TestClient) -> None:
    _tenant_id, key = create_tenant_and_key(role="runtime")
    response = auth_client.get("/v1/active-policies", headers={"Authorization": f"Bearer {key}"})
    assert response.status_code == 403


def test_tenant_key_only_reads_its_own_policies_and_audit(auth_client: TestClient) -> None:
    tenant_id, key = create_tenant_and_key(role="tenant_admin")
    # Add one tenant-specific active row. No demo policy should be visible under this key.
    from app.db.database import get_db as configured_get_db

    generator = app.dependency_overrides[configured_get_db]()
    session = next(generator)
    try:
        session.add(
            Policy(
                tenant_id=tenant_id,
                policy_key="tenant_private_rule",
                action="discounts.apply",
                effect="DENY",
                priority=1,
                conditions=[],
                summary="Private tenant rule",
                reason="Private to this tenant",
                status="active",
                version=1,
                authored_by="test",
                approved_by="test",
                locked_at=datetime.now(timezone.utc),
            )
        )
        session.commit()
    finally:
        try:
            next(generator)
        except StopIteration:
            pass

    # Write a demo-tenant audit row via the local-only credential-free pathway.
    demo_eval = auth_client.post(
        "/v1/evaluate",
        json={
            "request_id": "auth-tenant-isolation-demo-event",
            "agent_id": "support_bot_1",
            "action": "refunds.create",
            "params": {"amount_inr": 8000, "customer_id": "c_9821"},
        },
    )
    assert demo_eval.status_code == 200

    headers = {"Authorization": f"Bearer {key}"}
    policies = auth_client.get("/v1/active-policies", headers=headers)
    assert policies.status_code == 200
    assert [row["policy_key"] for row in policies.json()] == ["tenant_private_rule"]

    verification = auth_client.get("/v1/audit/verify", headers=headers)
    assert verification.status_code == 200
    assert verification.json()["valid"] is True
    assert verification.json()["checked_records"] == 0


def test_expired_key_is_rejected(auth_client: TestClient) -> None:
    _tenant_id, key = create_tenant_and_key(
        role="tenant_admin", expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)
    )
    response = auth_client.get("/v1/active-policies", headers={"Authorization": f"Bearer {key}"})
    assert response.status_code == 401


def test_key_revocation_takes_effect(auth_client: TestClient) -> None:
    tenant_id, key = create_tenant_and_key(role="tenant_admin")
    key_id = key.split("_", 1)[1].split(".", 1)[0]

    from app.db.database import get_db as configured_get_db

    generator = app.dependency_overrides[configured_get_db]()
    session = next(generator)
    try:
        record = session.get(APIKey, key_id)
        assert record is not None
        record.is_active = False
        record.revoked_at = datetime.now(timezone.utc)
        session.commit()
    finally:
        try:
            next(generator)
        except StopIteration:
            pass

    response = auth_client.get("/v1/active-policies", headers={"Authorization": f"Bearer {key}"})
    assert response.status_code == 401


def test_authenticated_tenant_without_complete_baseline_fails_closed(auth_client: TestClient) -> None:
    _tenant_id, key = create_tenant_and_key(role="runtime")
    response = auth_client.post(
        "/v1/evaluate",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "request_id": "tenant-without-baseline",
            "agent_id": "support_bot_1",
            "action": "refunds.create",
            "params": {"amount_inr": 1000, "customer_id": "customer-1"},
        },
    )
    assert response.status_code == 200
    assert response.json()["decision"] == "deny"
    assert "fail-closed" in response.json()["reason"].lower()


def create_key_for_existing_tenant(tenant_id: str, role: str = "tenant_admin") -> str:
    """Create a key bound to an already-existing tenant in the fixture DB."""
    from app.db.database import get_db as configured_get_db

    generator = app.dependency_overrides[configured_get_db]()
    session = next(generator)
    try:
        key_id, secret, presented = generate_api_key_material()
        session.add(
            APIKey(
                key_id=key_id,
                tenant_id=tenant_id,
                name="existing-tenant test key",
                secret_hash=hash_api_key_secret(secret),
                role=role,
                scopes=sorted(ROLE_SCOPES[role]),
                is_active=True,
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            )
        )
        session.commit()
        return presented
    finally:
        try:
            next(generator)
        except StopIteration:
            pass


def test_valid_api_key_can_evaluate_its_own_tenant(auth_client: TestClient) -> None:
    from app.config import settings

    key = create_key_for_existing_tenant(settings.demo_tenant_id, role="runtime")
    response = auth_client.post(
        "/v1/evaluate",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "request_id": "api-key-runtime-evaluation",
            "agent_id": "support_bot_1",
            "action": "refunds.create",
            "params": {"amount_inr": 8000, "customer_id": "c_9821"},
        },
    )
    assert response.status_code == 200
    assert response.json()["decision"] == "hold"
    assert response.json()["policy_key"] == "refund_cap_v1"


def test_credential_free_access_is_disabled_outside_development(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "app_env", "test")
    response = auth_client.get("/v1/active-policies")
    assert response.status_code == 401
