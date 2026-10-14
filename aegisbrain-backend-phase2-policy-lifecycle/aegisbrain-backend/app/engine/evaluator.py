"""Pure-Python deterministic AST evaluator.

This module intentionally performs no LLM, network, or database calls. Runtime
checks operate only on a validated request, an action catalogue, and immutable
policy objects passed into evaluate().
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any, Callable

from pydantic import JsonValue

from app.schemas.evaluate import EvaluateRequest
from app.schemas.policy import Condition, ConditionOperator, PolicyRule, Verdict


@dataclass(frozen=True, slots=True)
class EvaluationResult:
    decision: Verdict
    policy_key: str | None
    policy_version: int | None
    reason: str
    latency_ms: float


ActionValidator = Callable[[dict[str, JsonValue]], str | None]


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_positive_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _validate_refund(params: dict[str, JsonValue]) -> str | None:
    amount = params.get("amount_inr")
    customer_id = params.get("customer_id")
    if not _is_number(amount) or amount <= 0:
        return "Required parameter 'amount_inr' must be a finite number greater than zero."
    if not isinstance(customer_id, str) or not customer_id.strip():
        return "Required parameter 'customer_id' must be a non-empty string."
    return None


def _validate_discount(params: dict[str, JsonValue]) -> str | None:
    discount = params.get("discount_pct")
    tier = params.get("customer_tier")
    order_id = params.get("order_id")
    if not _is_number(discount) or not 0 <= discount <= 100:
        return "Required parameter 'discount_pct' must be a number from 0 through 100."
    if not isinstance(tier, str) or tier not in {"regular", "vip"}:
        return "Required parameter 'customer_tier' must be 'regular' or 'vip'."
    if not _is_positive_integer(order_id):
        return "Required parameter 'order_id' must be a positive integer."
    return None


def _validate_order_status(params: dict[str, JsonValue]) -> str | None:
    order_id = params.get("order_id")
    status = params.get("status")
    if not _is_positive_integer(order_id):
        return "Required parameter 'order_id' must be a positive integer."
    if not isinstance(status, str) or status not in {"PROCESSING", "PACKED", "DISPATCHED", "DELIVERED", "CANCELLED"}:
        return "Required parameter 'status' is not a supported order status."
    return None


# Explicit registration is the fail-closed boundary for Stage 0. An unknown
# action never becomes ALLOW merely because no policy matched.
ACTION_VALIDATORS: dict[str, ActionValidator] = {
    "refunds.create": _validate_refund,
    "discounts.apply": _validate_discount,
    "orders.update_status": _validate_order_status,
}

_MISSING = object()
_EFFECT_TIE_RANK = {Verdict.DENY: 0, Verdict.HOLD: 1, Verdict.ALLOW: 2}


def _read_path(params: dict[str, JsonValue], dotted_path: str) -> Any:
    current: Any = params
    for segment in dotted_path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return _MISSING
        current = current[segment]
    return current


def _same_typed_value(left: Any, right: Any) -> bool:
    """Compare values without Python's bool-is-an-int equality surprise."""
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left is right
    if _is_number(left) and _is_number(right):
        return left == right
    return type(left) is type(right) and left == right


def _evaluate_condition(condition: Condition, params: dict[str, JsonValue]) -> bool:
    actual = _read_path(params, condition.field)
    if actual is _MISSING:
        return False

    expected = condition.value
    operator = condition.operator

    if operator == ConditionOperator.EQ:
        return _same_typed_value(actual, expected)
    if operator == ConditionOperator.NE:
        return not _same_typed_value(actual, expected)
    if operator == ConditionOperator.GT:
        if _is_number(actual) and _is_number(expected):
            return actual > expected
        if isinstance(actual, str) and isinstance(expected, str):
            return actual > expected
        return False
    if operator == ConditionOperator.LT:
        if _is_number(actual) and _is_number(expected):
            return actual < expected
        if isinstance(actual, str) and isinstance(expected, str):
            return actual < expected
        return False
    if operator == ConditionOperator.IN:
        if not isinstance(expected, list):
            return False
        return any(_same_typed_value(actual, candidate) for candidate in expected)
    if operator == ConditionOperator.CONTAINS:
        if isinstance(actual, str) and isinstance(expected, str):
            return expected in actual
        if isinstance(actual, list):
            return any(_same_typed_value(candidate, expected) for candidate in actual)
        if isinstance(actual, dict) and isinstance(expected, str):
            return expected in actual
        return False
    return False


def _matches(rule: PolicyRule, params: dict[str, JsonValue]) -> bool:
    # The semantics are explicitly AND: every condition must be true.
    return all(_evaluate_condition(condition, params) for condition in rule.conditions)


def evaluate(request: EvaluateRequest, policies: list[PolicyRule] | tuple[PolicyRule, ...]) -> EvaluationResult:
    """Evaluate one action. Engine latency excludes DB access and audit writes."""
    started_ns = time.perf_counter_ns()

    validator = ACTION_VALIDATORS.get(request.action)
    if validator is None:
        elapsed_ms = (time.perf_counter_ns() - started_ns) / 1_000_000
        return EvaluationResult(
            decision=Verdict.DENY,
            policy_key=None,
            policy_version=None,
            reason=(
                f"Action '{request.action}' is not registered with this gateway. "
                "The request is denied by the fail-closed default."
            ),
            latency_ms=elapsed_ms,
        )

    validation_error = validator(request.params)
    if validation_error is not None:
        elapsed_ms = (time.perf_counter_ns() - started_ns) / 1_000_000
        return EvaluationResult(
            decision=Verdict.DENY,
            policy_key=None,
            policy_version=None,
            reason=f"Invalid action parameters. {validation_error} No action may proceed.",
            latency_ms=elapsed_ms,
        )

    candidates = [
        rule for rule in policies
        if rule.status == "active" and rule.action == request.action and _matches(rule, request.params)
    ]
    candidates.sort(key=lambda rule: (-rule.priority, _EFFECT_TIE_RANK[rule.effect], rule.policy_key))
    matched = candidates[0] if candidates else None
    elapsed_ms = (time.perf_counter_ns() - started_ns) / 1_000_000

    if matched is None:
        return EvaluationResult(
            decision=Verdict.ALLOW,
            policy_key=None,
            policy_version=None,
            reason="No active policy blocks this registered action.",
            latency_ms=elapsed_ms,
        )

    return EvaluationResult(
        decision=matched.effect,
        policy_key=matched.policy_key,
        policy_version=matched.version,
        reason=matched.reason,
        latency_ms=elapsed_ms,
    )
