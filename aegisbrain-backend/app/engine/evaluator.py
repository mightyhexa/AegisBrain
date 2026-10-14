"""Pure-Python deterministic AST evaluator.

This module intentionally performs no LLM, network, or database calls. Runtime
checks operate only on a validated request, an action catalogue, and immutable
policy objects passed into evaluate().
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, TypeGuard

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


def _is_number(value: Any) -> TypeGuard[int | float]:
    """TypeGuard narrowing values to finite numeric types (excludes bool)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_positive_integer(value: Any) -> TypeGuard[int]:
    """TypeGuard narrowing values to positive integers (excludes bool)."""
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
    valid_statuses = {"PROCESSING", "PACKED", "DISPATCHED", "DELIVERED", "CANCELLED"}
    if not isinstance(status, str) or status not in valid_statuses:
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


def _effect_tie_rank(effect: Any) -> int:
    """Deterministically ranks verdict effects: DENY (0) > HOLD (1) > ALLOW (2).

    Safely handles both Verdict enum instances and raw strings.
    """
    raw = getattr(effect, "value", effect)
    normalized = str(raw).lower() if raw is not None else ""
    return {"deny": 0, "hold": 1, "allow": 2}.get(normalized, 99)


def _read_path(params: dict[str, Any] | None, dotted_path: str) -> Any:
    """Traverses dotted dictionary paths safely without raising unhandled exceptions."""
    if not isinstance(params, dict) or not dotted_path:
        return _MISSING
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


def _evaluate_condition(condition: Condition | dict[str, Any], params: dict[str, JsonValue]) -> bool:
    field = getattr(condition, "field", None) or condition.get("field", "")  # type: ignore[union-attr]
    expected = getattr(condition, "value", None) if hasattr(condition, "value") else condition.get("value")  # type: ignore[union-attr]
    operator = getattr(condition, "operator", None) if hasattr(condition, "operator") else condition.get("operator")  # type: ignore[union-attr]

    actual = _read_path(params, field)
    if actual is _MISSING:
        return False

    op_val = getattr(operator, "value", operator)

    if operator == ConditionOperator.EQ or op_val == "==":
        return _same_typed_value(actual, expected)
    if operator == ConditionOperator.NE or op_val == "!=":
        return not _same_typed_value(actual, expected)
    if operator == ConditionOperator.GT or op_val == ">":
        if _is_number(actual) and _is_number(expected):
            return actual > expected
        if isinstance(actual, str) and isinstance(expected, str):
            return actual > expected
        return False
    if op_val in {">=", "gte"}:
        if _is_number(actual) and _is_number(expected):
            return actual >= expected
        if isinstance(actual, str) and isinstance(expected, str):
            return actual >= expected
        return False
    if operator == ConditionOperator.LT or op_val == "<":
        if _is_number(actual) and _is_number(expected):
            return actual < expected
        if isinstance(actual, str) and isinstance(expected, str):
            return actual < expected
        return False
    if op_val in {"<=", "lte"}:
        if _is_number(actual) and _is_number(expected):
            return actual <= expected
        if isinstance(actual, str) and isinstance(expected, str):
            return actual <= expected
        return False
    if operator == ConditionOperator.IN or op_val == "in":
        if not isinstance(expected, (list, tuple, set)):
            return False
        return any(_same_typed_value(actual, candidate) for candidate in expected)
    if operator == ConditionOperator.CONTAINS or op_val == "contains":
        if isinstance(actual, str) and isinstance(expected, str):
            return expected in actual
        if isinstance(actual, (list, tuple)):
            return any(_same_typed_value(candidate, expected) for candidate in actual)
        if isinstance(actual, dict) and isinstance(expected, str):
            return expected in actual
        return False

    return False


def _matches(rule: PolicyRule, params: dict[str, JsonValue]) -> bool:
    """Evaluates rule conditions with AND semantics; all conditions must evaluate to True."""
    return all(_evaluate_condition(condition, params) for condition in rule.conditions)


def evaluate(
    request: EvaluateRequest,
    policies: list[PolicyRule] | tuple[PolicyRule, ...],
) -> EvaluationResult:
    """Evaluates one agent action against active policies."""
    started_ns = time.perf_counter_ns()

    if not isinstance(request.params, dict):
        elapsed_ms = (time.perf_counter_ns() - started_ns) / 1_000_000
        return EvaluationResult(
            decision=Verdict.DENY,
            policy_key=None,
            policy_version=None,
            reason="Invalid action parameters: 'params' must be a valid JSON object.",
            latency_ms=elapsed_ms,
        )

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
        if getattr(rule.status, "value", rule.status) == "active"
        and rule.action == request.action
        and _matches(rule, request.params)
    ]

    candidates.sort(
        key=lambda rule: (
            -rule.priority,
            _effect_tie_rank(rule.effect),
            str(rule.policy_key),
        )
    )

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

    matched_verdict = matched.effect if isinstance(matched.effect, Verdict) else Verdict(matched.effect)

    return EvaluationResult(
        decision=matched_verdict,
        policy_key=matched.policy_key,
        policy_version=matched.version,
        reason=matched.reason,
        latency_ms=elapsed_ms,
    )