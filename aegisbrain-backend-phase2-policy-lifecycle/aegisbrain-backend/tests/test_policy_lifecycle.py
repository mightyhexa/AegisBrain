"""Policy lifecycle integration tests: tenant scope, four-eyes locking, versioning and provenance."""

from collections.abc import Generator
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db.database import Base, get_db
from app.db.models import APIKey, PolicyLifecycleEvent, Tenant
from app.db.seed import seed_demo_data
from app.main import app
from app.security.auth import ROLE_SCOPES, generate_api_key_material, hash_api_key_secret


@pytest.fixture()
def lifecycle_client() -> Generator[TestClient, None, None]:
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


def make_key(tenant_id: str, role: str) -> tuple[str, str]:
    """Return (presented_token, key_id), attached to the current fixture DB."""
    configured_get_db = get_db
    generator = app.dependency_overrides[configured_get_db]()
    session = next(generator)
    try:
        key_id, secret, presented = generate_api_key_material()
        session.add(APIKey(
            key_id=key_id,
            tenant_id=tenant_id,
            name=f"test {role} {key_id}",
            secret_hash=hash_api_key_secret(secret),
            role=role,
            scopes=sorted(ROLE_SCOPES[role]),
            is_active=True,
        ))
        session.commit()
        return presented, key_id
    finally:
        try:
            next(generator)
        except StopIteration:
            pass


def new_tenant() -> str:
    configured_get_db = get_db
    generator = app.dependency_overrides[configured_get_db]()
    session = next(generator)
    tenant_id = f"life-tenant-{uuid4().hex[:16]}"
    try:
        session.add(Tenant(id=tenant_id, name="Lifecycle isolation tenant", is_demo=False))
        session.commit()
        return tenant_id
    finally:
        try:
            next(generator)
        except StopIteration:
            pass


def headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def sample_draft(policy_key: str = "test.lifecycle.policy", **overrides) -> dict:
    body = {
        "policy_key": policy_key,
        "action": "orders.update_status",
        "effect": "HOLD",
        "priority": 50,
        "conditions": [{"field": "status", "operator": "==", "value": "CANCELLED"}],
        "summary": "Cancelled order changes require review",
        "reason": "The order is cancelled; a manager must review further changes.",
        "source_channel": "#ops-policy",
        "source_message_id": "slack-msg-123",
        "source_text": "Treat cancelled order status changes as requiring manager review.",
    }
    body.update(overrides)
    return body


def test_draft_creation_is_tenant_bound_and_not_active_until_locked(lifecycle_client: TestClient) -> None:
    # The local development-demo principal can read/evaluate but cannot mutate policies.
    denied = lifecycle_client.post("/v1/policies/drafts", json=sample_draft())
    assert denied.status_code == 403

    author, author_id = make_key(settings.demo_tenant_id, "policy_admin")
    response = lifecycle_client.post(
        "/v1/policies/drafts", headers=headers(author), json=sample_draft()
    )
    assert response.status_code == 201, response.text
    row = response.json()
    assert row["status"] == "draft"
    assert row["authored_by"] == author_id
    assert row["approved_by"] is None
    assert row["source_message_id"] == "slack-msg-123"

    active = lifecycle_client.get("/v1/active-policies", headers=headers(author))
    assert active.status_code == 200
    assert "test.lifecycle.policy" not in {item["policy_key"] for item in active.json()}


def test_four_eyes_lock_publishes_and_logs_provenance(lifecycle_client: TestClient) -> None:
    author, author_id = make_key(settings.demo_tenant_id, "tenant_admin")
    reviewer, reviewer_id = make_key(settings.demo_tenant_id, "tenant_admin")
    draft = lifecycle_client.post(
        "/v1/policies/drafts", headers=headers(author), json=sample_draft()
    )
    assert draft.status_code == 201, draft.text
    revision_id = draft.json()["id"]

    self_approval = lifecycle_client.post(
        f"/v1/policies/drafts/{revision_id}/lock", headers=headers(author)
    )
    assert self_approval.status_code == 409

    locked = lifecycle_client.post(
        f"/v1/policies/drafts/{revision_id}/lock", headers=headers(reviewer)
    )
    assert locked.status_code == 200, locked.text
    locked_body = locked.json()
    assert locked_body["status"] == "active"
    assert locked_body["authored_by"] == author_id
    assert locked_body["approved_by"] == reviewer_id
    assert locked_body["locked_at"] is not None

    active = lifecycle_client.get("/v1/active-policies", headers=headers(reviewer))
    assert active.status_code == 200
    policy = next(row for row in active.json() if row["policy_key"] == "test.lifecycle.policy")
    assert policy["effect"] == "HOLD"
    assert policy["version"] == 1

    history = lifecycle_client.get(
        "/v1/policies/history/test.lifecycle.policy", headers=headers(reviewer)
    )
    assert history.status_code == 200
    assert len(history.json()["revisions"]) == 1

    audit = lifecycle_client.get("/v1/policies/audit/verify", headers=headers(reviewer))
    assert audit.status_code == 200, audit.text
    assert audit.json()["valid"] is True
    assert audit.json()["checked_records"] == 2
    assert len(audit.json()["last_hash"]) == 64


def test_new_version_supersedes_previous_and_locked_revision_is_not_editable(lifecycle_client: TestClient) -> None:
    author, _ = make_key(settings.demo_tenant_id, "tenant_admin")
    reviewer, _ = make_key(settings.demo_tenant_id, "tenant_admin")

    first = lifecycle_client.post(
        "/v1/policies/drafts", headers=headers(author), json=sample_draft()
    )
    assert first.status_code == 201, first.text
    first_id = first.json()["id"]
    locked_first = lifecycle_client.post(
        f"/v1/policies/drafts/{first_id}/lock", headers=headers(reviewer)
    )
    assert locked_first.status_code == 200, locked_first.text

    second = lifecycle_client.post(
        "/v1/policies/drafts", headers=headers(author),
        json=sample_draft(summary="Updated order review rule", priority=70),
    )
    assert second.status_code == 201, second.text
    assert second.json()["version"] == 2
    second_id = second.json()["id"]
    locked_second = lifecycle_client.post(
        f"/v1/policies/drafts/{second_id}/lock", headers=headers(reviewer)
    )
    assert locked_second.status_code == 200, locked_second.text

    history = lifecycle_client.get(
        "/v1/policies/history/test.lifecycle.policy", headers=headers(reviewer)
    )
    assert history.status_code == 200
    by_version = {row["version"]: row for row in history.json()["revisions"]}
    assert by_version[1]["status"] == "superseded"
    assert by_version[2]["status"] == "active"
    assert by_version[2]["summary"] == "Updated order review rule"

    edit_locked = lifecycle_client.patch(
        f"/v1/policies/drafts/{first_id}", headers=headers(author),
        json={"summary": "Attempt to rewrite a locked revision"},
    )
    assert edit_locked.status_code == 409

    active = lifecycle_client.get("/v1/active-policies", headers=headers(reviewer))
    current = next(row for row in active.json() if row["policy_key"] == "test.lifecycle.policy")
    assert current["version"] == 2
    assert current["summary"] == "Updated order review rule"


def test_policy_admin_can_edit_own_draft_but_cannot_lock(lifecycle_client: TestClient) -> None:
    author, _ = make_key(settings.demo_tenant_id, "policy_admin")
    reviewer, _ = make_key(settings.demo_tenant_id, "tenant_admin")
    created = lifecycle_client.post(
        "/v1/policies/drafts", headers=headers(author), json=sample_draft("test.patch.policy")
    )
    assert created.status_code == 201, created.text
    revision_id = created.json()["id"]

    patched = lifecycle_client.patch(
        f"/v1/policies/drafts/{revision_id}", headers=headers(author),
        json={"summary": "A reviewed summary", "priority": 99},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["summary"] == "A reviewed summary"
    assert patched.json()["priority"] == 99

    forbidden_lock = lifecycle_client.post(
        f"/v1/policies/drafts/{revision_id}/lock", headers=headers(author)
    )
    assert forbidden_lock.status_code == 403

    rejected = lifecycle_client.post(
        f"/v1/policies/drafts/{revision_id}/reject",
        headers=headers(reviewer), json={"reason": "The policy needs clearer conditions."},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["rejection_reason"] == "The policy needs clearer conditions."


def test_policy_lifecycle_reads_do_not_cross_tenant_boundaries(lifecycle_client: TestClient) -> None:
    demo_admin, _ = make_key(settings.demo_tenant_id, "tenant_admin")
    other_tenant = new_tenant()
    other_admin, _ = make_key(other_tenant, "tenant_admin")

    created = lifecycle_client.post(
        "/v1/policies/drafts", headers=headers(demo_admin), json=sample_draft("test.private.policy")
    )
    assert created.status_code == 201, created.text

    other_drafts = lifecycle_client.get("/v1/policies/drafts", headers=headers(other_admin))
    assert other_drafts.status_code == 200
    assert "test.private.policy" not in {row["policy_key"] for row in other_drafts.json()}

    other_history = lifecycle_client.get(
        "/v1/policies/history/test.private.policy", headers=headers(other_admin)
    )
    assert other_history.status_code == 404

    other_audit = lifecycle_client.get("/v1/policies/audit/verify", headers=headers(other_admin))
    assert other_audit.status_code == 200
    assert other_audit.json()["checked_records"] == 0


def test_new_tenant_can_bootstrap_and_lock_complete_baseline(lifecycle_client: TestClient) -> None:
    tenant_id = new_tenant()
    author, author_id = make_key(tenant_id, "tenant_admin")
    reviewer, reviewer_id = make_key(tenant_id, "tenant_admin")

    bootstrapped = lifecycle_client.post(
        "/v1/policies/drafts/bootstrap-baseline", headers=headers(author)
    )
    assert bootstrapped.status_code == 201, bootstrapped.text
    drafts = bootstrapped.json()
    assert {row["policy_key"] for row in drafts} == {
        "refund_cap_v1", "promo_cap_v2", "promo_vip_exception_v1"
    }
    assert all(row["status"] == "draft" for row in drafts)
    assert all(row["authored_by"] == author_id for row in drafts)
    assert all(row["approved_by"] is None for row in drafts)

    for draft in drafts:
        locked = lifecycle_client.post(
            f"/v1/policies/drafts/{draft['id']}/lock", headers=headers(reviewer)
        )
        assert locked.status_code == 200, locked.text
        assert locked.json()["approved_by"] == reviewer_id

    scenarios = [
        ({"request_id": "new-tenant-refund", "agent_id": "support_bot_1", "action": "refunds.create",
          "params": {"amount_inr": 8000, "customer_id": "c_9821"}}, "hold", "refund_cap_v1"),
        ({"request_id": "new-tenant-discount", "agent_id": "sales_bot_3", "action": "discounts.apply",
          "params": {"discount_pct": 10, "customer_tier": "regular", "order_id": 881}}, "deny", "promo_cap_v2"),
        ({"request_id": "new-tenant-vip", "agent_id": "sales_bot_3", "action": "discounts.apply",
          "params": {"discount_pct": 10, "customer_tier": "vip", "order_id": 902}}, "hold", "promo_vip_exception_v1"),
        ({"request_id": "new-tenant-order", "agent_id": "ops_bot_2", "action": "orders.update_status",
          "params": {"order_id": 88219, "status": "DISPATCHED"}}, "allow", None),
    ]
    for payload, expected_decision, expected_key in scenarios:
        response = lifecycle_client.post("/v1/evaluate", headers=headers(author), json=payload)
        assert response.status_code == 200, response.text
        assert response.json()["decision"] == expected_decision
        assert response.json()["policy_key"] == expected_key

    decisions_chain = lifecycle_client.get("/v1/audit/verify", headers=headers(reviewer))
    policy_chain = lifecycle_client.get("/v1/policies/audit/verify", headers=headers(reviewer))
    assert decisions_chain.status_code == 200 and decisions_chain.json()["valid"] is True
    assert decisions_chain.json()["checked_records"] == 4
    assert policy_chain.status_code == 200 and policy_chain.json()["valid"] is True
    assert policy_chain.json()["checked_records"] == 6


def test_policy_lifecycle_audit_detects_event_payload_tampering(lifecycle_client: TestClient) -> None:
    admin, _ = make_key(settings.demo_tenant_id, "tenant_admin")
    reviewer, _ = make_key(settings.demo_tenant_id, "tenant_admin")
    draft = lifecycle_client.post(
        "/v1/policies/drafts", headers=headers(admin), json=sample_draft("test.tamper.policy")
    )
    assert draft.status_code == 201, draft.text
    locked = lifecycle_client.post(
        f"/v1/policies/drafts/{draft.json()['id']}/lock", headers=headers(reviewer)
    )
    assert locked.status_code == 200, locked.text

    generator = app.dependency_overrides[get_db]()
    session = next(generator)
    try:
        event = session.scalars(select(PolicyLifecycleEvent).order_by(PolicyLifecycleEvent.id.asc())).first()
        assert event is not None
        event.details = {**event.details, "tampered": True}
        session.commit()
    finally:
        try:
            next(generator)
        except StopIteration:
            pass

    verification = lifecycle_client.get("/v1/policies/audit/verify", headers=headers(reviewer))
    assert verification.status_code == 200
    assert verification.json()["valid"] is False
    assert verification.json()["failed_event_id"] is not None
