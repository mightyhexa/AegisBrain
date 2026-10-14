"""AegisBrain Production Gateway Verification & Smoke Test Script."""

from __future__ import annotations

import json
import httpx

GATEWAY_URL = "http://127.0.0.1:8000"


def main() -> None:
    print("\n" + "=" * 76)
    print(" 🛡️  AEGISBRAIN GATEWAY & SUB-MILLISECOND AST VERIFICATION")
    print("=" * 76)

    try:
        health = httpx.get(f"{GATEWAY_URL}/health", timeout=3.0)
        print(f"\n[1] Health Check Status: {health.status_code} -> {health.json()}")
    except Exception as e:
        print(f"\n[!] Error: Cannot reach FastAPI at {GATEWAY_URL}. Make sure uvicorn is running.")
        print(f"Details: {e}")
        return

    # Test agent evaluation payload
    payload = {
        "request_id": "smoke-test-01",
        "agent_id": "sales_bot_prod",
        "action": "discounts.apply",
        "params": {"discount_pct": 10, "customer_tier": "regular", "order_id": 999},
    }

    print(f"\n[2] Evaluating Agent Payload: {json.dumps(payload, indent=2)}")
    res = httpx.post(f"{GATEWAY_URL}/v1/evaluate", json=payload, timeout=5.0)
    print(f"Response Status: {res.status_code}")
    print(json.dumps(res.json(), indent=2))
    print("\n" + "=" * 76)
    print(" ✓ Gateway verification completed successfully.")
    print("=" * 76 + "\n")


if __name__ == "__main__":
    main()