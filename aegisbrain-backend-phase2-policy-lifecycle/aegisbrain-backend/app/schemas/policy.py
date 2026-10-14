"""Typed policy rule schema used by the deterministic AST evaluator."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator


class Verdict(StrEnum):
    ALLOW = "ALLOW"
    HOLD = "HOLD"
    DENY = "DENY"


class ConditionOperator(StrEnum):
    EQ = "=="
    NE = "!="
    GT = ">"
    LT = "<"
    IN = "in"
    CONTAINS = "contains"


class Condition(BaseModel):
    """One typed AST comparison against a dotted parameter path."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    field: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z_][A-Za-z0-9_.-]*$")
    operator: ConditionOperator
    value: JsonValue

    @model_validator(mode="after")
    def validate_operator_value(self) -> "Condition":
        if self.operator == ConditionOperator.IN and not isinstance(self.value, list):
            raise ValueError("The 'in' operator requires a list value.")
        if self.operator == ConditionOperator.CONTAINS and isinstance(self.value, (dict, list)):
            raise ValueError("The 'contains' operator's comparison value must be a scalar.")
        if self.operator in (ConditionOperator.GT, ConditionOperator.LT):
            if isinstance(self.value, bool) or not isinstance(self.value, (int, float, str)):
                raise ValueError("Ordered comparisons require a number or string value.")
        return self


class PolicyRule(BaseModel):
    """A compiled, active policy rule. Conditions are ANDed together."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    policy_key: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$")
    action: str = Field(min_length=1, max_length=128, pattern=r"^[a-z][a-z0-9_.-]*$")
    effect: Verdict
    priority: int = Field(ge=0, le=1_000_000)
    conditions: list[Condition] = Field(default_factory=list, max_length=64)
    summary: str = Field(min_length=1, max_length=500)
    reason: str = Field(min_length=1, max_length=2_000)
    version: int = Field(default=1, ge=1)
    status: Literal["active"] = "active"

    @field_validator("conditions")
    @classmethod
    def no_duplicate_condition_fields(cls, conditions: list[Condition]) -> list[Condition]:
        # Multiple comparisons on the same field are valid (e.g. amount > 0 and amount < 5000).
        # No rewrite or implicit condition merging is performed.
        return conditions
