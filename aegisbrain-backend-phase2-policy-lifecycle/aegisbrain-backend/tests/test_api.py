"""FastAPI contract and audit-chain integration tests using an isolated SQLite DB."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.evaluate import router as evaluate_router
from app.config import settings
from app.db.audit import verify_tenant_chain
from app.db.database import Base, get_db
from app.db.models import Decision
from app.db.seed import seed_demo_data
from app.main import app


@pytest.fixture()
def api_client() -> Generator[TestClient, None, None]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=test_engine)
    with TestingSessionLocal() as session:
        seed_demo_data(session)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    test_engine.dispose()


@pytest.mark.parametrize(
    ("payload", "decision", "policy_key"),
    [
        ({"request_id": "api-refund", "agent_id": "support_bot_1", "action": "refunds.create",
          "params": {"amount_inr": 8000, "customer_id": "c_9821"}}, "hold", "refund_cap_v1"),
        ({"request_id": "api-discount", "agent_id": "sales_bot_3", "action": "discounts.apply",
          "params": {"discount_pct": 10, "customer_tier": "regular", "order_id": 881}}, "deny", "promo_cap_v2"),
        ({"request_id": "api-vip", "agent_id": "sales_bot_3", "action": "discounts.apply",
          "params": {"discount_pct": 10, "customer_tier": "vip", "order_id": 902}}, "hold", "promo_vip_exception_v1"),
        ({"request_id": "api-order", "agent_id": "ops_bot_2", "action": "orders.update_status",
          "params": {"order_id": 88219, "status": "DISPATCHED"}}, "allow", None),
    ],
)
def test_frontend_scenarios_match_contract(api_client: TestClient, payload: dict,
                                           decision: str, policy_key: str | None) -> None:
    response = api_client.post("/v1/evaluate", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["decision"] == decision
    assert body["policy_key"] == policy_key
    assert isinstance(body["reason"], str) and body["reason"]
    assert len(body["audit_hash"]) == 64
    assert body["request_id"] == payload["request_id"]


def test_active_policies_endpoint_returns_three_seed_rules(api_client: TestClient) -> None:
    response = api_client.get("/v1/active-policies")
    assert response.status_code == 200
    keys = {rule["policy_key"] for rule in response.json()}
    assert keys == {"refund_cap_v1", "promo_cap_v2", "promo_vip_exception_v1"}


def test_unknown_action_is_denied_not_allowed(api_client: TestClient) -> None:
    response = api_client.post("/v1/evaluate", json={
        "request_id": "unknown-action",
        "agent_id": "test_agent",
        "action": "database.drop",
        "params": {"table": "customers"},
    })
    assert response.status_code == 200
    assert response.json()["decision"] == "deny"
    assert response.json()["policy_key"] is None


def test_request_id_is_idempotent_and_payload_mismatch_conflicts(api_client: TestClient) -> None:
    payload = {
        "request_id": "idempotent-1", "agent_id": "support_bot_1", "action": "refunds.create",
        "params": {"amount_inr": 8000, "customer_id": "c_9821"},
    }
    first = api_client.post("/v1/evaluate", json=payload)
    repeated = api_client.post("/v1/evaluate", json=payload)
    changed = {**payload, "params": {"amount_inr": 1000, "customer_id": "c_9821"}}
    conflict = api_client.post("/v1/evaluate", json=changed)
    assert first.status_code == repeated.status_code == 200
    assert first.json()["audit_hash"] == repeated.json()["audit_hash"]
    assert conflict.status_code == 409


def test_audit_chain_verifies_after_api_calls(api_client: TestClient) -> None:
    for request_id, amount in (("chain-a", 1000), ("chain-b", 8000)):
        response = api_client.post("/v1/evaluate", json={
            "request_id": request_id, "agent_id": "support_bot_1", "action": "refunds.create",
            "params": {"amount_inr": amount, "customer_id": "c_9821"},
        })
        assert response.status_code == 200
    verification = api_client.get("/v1/audit/verify")
    assert verification.status_code == 200
    assert verification.json()["valid"] is True
    assert verification.json()["checked_records"] == 2
