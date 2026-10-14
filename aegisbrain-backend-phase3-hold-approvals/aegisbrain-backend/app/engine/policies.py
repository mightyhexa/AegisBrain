"""Local demo policy fixtures. These are synthetic examples, not real approvals."""

from app.schemas.policy import Condition, ConditionOperator, PolicyRule, Verdict


DEFAULT_POLICIES: tuple[PolicyRule, ...] = (
    PolicyRule(
        policy_key="refund_cap_v1",
        action="refunds.create",
        effect=Verdict.HOLD,
        priority=10,
        conditions=[
            Condition(field="amount_inr", operator=ConditionOperator.GT, value=5000),
        ],
        summary="Refunds above ₹5,000 need a manager",
        reason="Refunds above ₹5,000 need a manager's approval. The refund is held, not issued.",
        version=1,
    ),
    PolicyRule(
        policy_key="promo_cap_v2",
        action="discounts.apply",
        effect=Verdict.DENY,
        priority=10,
        conditions=[
            Condition(field="discount_pct", operator=ConditionOperator.GT, value=5),
        ],
        summary="Discounts are capped at 5%",
        reason="Discounts above 5% are not allowed. Offer 5% or ask a manager.",
        version=2,
    ),
    PolicyRule(
        policy_key="promo_vip_exception_v1",
        action="discounts.apply",
        effect=Verdict.HOLD,
        priority=20,
        conditions=[
            Condition(field="discount_pct", operator=ConditionOperator.GT, value=5),
            Condition(field="customer_tier", operator=ConditionOperator.EQ, value="vip"),
        ],
        summary="VIP discounts above 5% need approval",
        reason="This VIP discount is above the cap. It is held until a manager approves this one request.",
        version=1,
    ),
)
