"""Live Autonomous Sales & Support Agent governed by AegisBrain SDK.

Run this in a terminal during your presentation:
    & ".\\.venv\\Scripts\\python.exe" live_agent.py
"""

from __future__ import annotations

import json

from aegis_sdk import AegisBrainSDK

aegis = AegisBrainSDK(
    gateway_url="http://127.0.0.1:8000",
    agent_id="autonomous_sales_bot_prod",
    auto_correct=True,
)


@aegis.guard(action="discounts.apply")
def apply_customer_discount(discount_pct: int, customer_tier: str, order_id: int) -> str:
    return f"Stripe Coupon issued: {discount_pct}% OFF for Order #{order_id} ({customer_tier})"


@aegis.guard(action="refunds.create")
def issue_customer_refund(amount_inr: int, customer_id: str) -> str:
    return f"Razorpay Refund processed: ₹{amount_inr:,} to Customer {customer_id}"


def main() -> None:
    print("\n" + "=" * 72)
    print(" 🛡️  AEGISBRAIN LIVE AUTONOMOUS AGENT — CONNECTED TO SUPABASE GATEWAY")
    print("=" * 72)

    print("\n[Test 1] Outdated AI Sales Agent tries to give 12% discount to a regular customer...")
    result_1 = apply_customer_discount(discount_pct=12, customer_tier="regular", order_id=9012)
    print(json.dumps(result_1, indent=2))

    print("\n[Test 2] AI Support Agent tries to issue ₹8,000 refund...")
    result_2 = issue_customer_refund(amount_inr=8000, customer_id="cust_hyd_881")
    print(json.dumps(result_2, indent=2, ensure_ascii=False))
    print("\n" + "=" * 72 + "\n")


if __name__ == "__main__":
    main()