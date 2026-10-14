"""Unit tests for deterministic evaluation and AST operator semantics."""

from app.engine.evaluator import evaluate
from app.engine.policies import DEFAULT_POLICIES
from app.schemas.evaluate import EvaluateRequest
from app.schemas.policy import Condition, ConditionOperator, PolicyRule, Verdict


def request(action: str, params: dict, request_id: str = "test-1") -> EvaluateRequest:
    return EvaluateRequest(request_id=request_id, agent_id="test_agent", action=action, params=params)


def test_refund_over_cap_is_held() -> None:
    result = evaluate(
        request("refunds.create", {"amount_inr": 8000, "customer_id": "c_9821"}),
        DEFAULT_POLICIES,
    )
    assert result.decision == Verdict.HOLD
    assert result.policy_key == "refund_cap_v1"
    assert "held, not issued" in result.reason


def test_refund_at_or_below_cap_is_allowed() -> None:
    result = evaluate(
        request("refunds.create", {"amount_inr": 5000, "customer_id": "c_9821"}),
        DEFAULT_POLICIES,
    )
    assert result.decision == Verdict.ALLOW
    assert result.policy_key is None


def test_regular_customer_discount_over_cap_is_denied() -> None:
    result = evaluate(
        request("discounts.apply", {"discount_pct": 10, "customer_tier": "regular", "order_id": 881}),
        DEFAULT_POLICIES,
    )
    assert result.decision == Verdict.DENY
    assert result.policy_key == "promo_cap_v2"


def test_vip_exception_has_higher_priority_than_broad_deny() -> None:
    result = evaluate(
        request("discounts.apply", {"discount_pct": 10, "customer_tier": "vip", "order_id": 902}),
        DEFAULT_POLICIES,
    )
    assert result.decision == Verdict.HOLD
    assert result.policy_key == "promo_vip_exception_v1"


def test_known_unblocked_order_action_is_allowed() -> None:
    result = evaluate(
        request("orders.update_status", {"order_id": 88219, "status": "DISPATCHED"}),
        DEFAULT_POLICIES,
    )
    assert result.decision == Verdict.ALLOW
    assert result.policy_key is None


def test_unknown_action_fails_closed() -> None:
    result = evaluate(request("database.drop", {"table": "customers"}), DEFAULT_POLICIES)
    assert result.decision == Verdict.DENY
    assert "not registered" in result.reason


def test_invalid_required_parameters_fail_closed() -> None:
    result = evaluate(request("refunds.create", {"amount_inr": 8000}), DEFAULT_POLICIES)
    assert result.decision == Verdict.DENY
    assert "customer_id" in result.reason


def test_bool_is_not_accepted_as_numeric_refund_amount() -> None:
    result = evaluate(request("refunds.create", {"amount_inr": True, "customer_id": "c_1"}), DEFAULT_POLICIES)
    assert result.decision == Verdict.DENY


def test_equal_priority_tie_prefers_deny_then_hold_then_allow() -> None:
    hold = PolicyRule(
        policy_key="hold-rule", action="orders.update_status", effect=Verdict.HOLD,
        priority=50, conditions=[], summary="Hold", reason="Hold it",
    )
    deny = PolicyRule(
        policy_key="deny-rule", action="orders.update_status", effect=Verdict.DENY,
        priority=50, conditions=[], summary="Deny", reason="Deny it",
    )
    result = evaluate(
        request("orders.update_status", {"order_id": 12, "status": "DISPATCHED"}),
        [hold, deny],
    )
    assert result.decision == Verdict.DENY
    assert result.policy_key == "deny-rule"


def test_condition_in_and_contains_are_deterministic() -> None:
    in_rule = PolicyRule(
        policy_key="in-rule", action="orders.update_status", effect=Verdict.HOLD,
        priority=10, conditions=[Condition(field="status", operator=ConditionOperator.IN,
                                            value=["DISPATCHED", "DELIVERED"])],
        summary="Status needs review", reason="Status requires review",
    )
    contains_rule = PolicyRule(
        policy_key="contains-rule", action="orders.update_status", effect=Verdict.DENY,
        priority=20, conditions=[Condition(field="status", operator=ConditionOperator.CONTAINS,
                                            value="PATCH")],
        summary="Status marker denied", reason="Status contains disallowed marker",
    )
    status_in = evaluate(request("orders.update_status", {"order_id": 12, "status": "DISPATCHED"}), [in_rule])
    status_contains = evaluate(request("orders.update_status", {"order_id": 12, "status": "PATCHED"}), [contains_rule])
    assert status_in.decision == Verdict.HOLD
    assert status_contains.decision == Verdict.DENY
