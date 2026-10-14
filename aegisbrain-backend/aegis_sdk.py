"""Official AegisBrain Python SDK for Autonomous AI Agents.

Intercepts agent tool calls, verifies them against the FastAPI + Supabase
Policy Gateway in < 1.5 ms, and automatically corrects outdated agent parameters.
"""

from __future__ import annotations

import functools
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True, slots=True)
class GatewayInterceptResult:
    allowed: bool
    verdict: str
    policy_key: str | None
    reason: str
    latency_ms: float
    audit_hash: str
    original_params: dict[str, Any]
    executed_params: dict[str, Any]
    auto_corrected: bool


class AegisBrainSDK:
    """Real runtime policy guard connecting Python AI agents to AegisBrain."""

    def __init__(
        self,
        *,
        gateway_url: str = "http://127.0.0.1:8000",
        api_key: str | None = None,
        agent_id: str = "live_python_agent_01",
        auto_correct: bool = True,
    ) -> None:
        self.gateway_url = gateway_url.rstrip("/")
        self.api_key = api_key
        self.agent_id = agent_id
        self.auto_correct = auto_correct

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def check_action(self, action: str, params: dict[str, Any]) -> GatewayInterceptResult:
        """Evaluates an action against the live Supabase policy ledger."""
        req_id = f"sdk-{self.agent_id}-{int(time.time() * 1000)}"
        res = httpx.post(
            f"{self.gateway_url}/v1/evaluate",
            headers=self._headers(),
            json={
                "request_id": req_id,
                "agent_id": self.agent_id,
                "action": action,
                "params": params,
            },
            timeout=5.0,
        )
        res.raise_for_status()
        data = res.json()

        decision = str(data.get("decision", "deny")).upper()
        reason = str(data.get("reason", ""))
        latency = float(data.get("latency_ms", 0.0))
        audit_hash = str(data.get("audit_hash", ""))
        policy_key = data.get("policy_key")

        if decision == "ALLOW":
            return GatewayInterceptResult(
                allowed=True,
                verdict="ALLOW",
                policy_key=policy_key,
                reason=reason,
                latency_ms=latency,
                audit_hash=audit_hash,
                original_params=params,
                executed_params=params,
                auto_corrected=False,
            )

        # If the agent used an outdated threshold and auto_correct is enabled,
        # extract the active manager cap from the policy reason and auto-correct
        corrected_params = dict(params)
        was_corrected = False
        if self.auto_correct:
            nums = [
                float(m.replace(",", ""))
                for m in re.findall(r"\b\d+(?:,\d{3})*(?:\.\d+)?\b", reason)
            ]
            if nums:
                cap = int(nums[0]) if nums[0].is_integer() else nums[0]
                if "discount_pct" in corrected_params and corrected_params["discount_pct"] > cap:
                    corrected_params["discount_pct"] = cap
                    was_corrected = True
                elif "amount_inr" in corrected_params and corrected_params["amount_inr"] > cap:
                    corrected_params["amount_inr"] = cap
                    was_corrected = True

        return GatewayInterceptResult(
            allowed=was_corrected,
            verdict=decision,
            policy_key=policy_key,
            reason=reason,
            latency_ms=latency,
            audit_hash=audit_hash,
            original_params=params,
            executed_params=corrected_params,
            auto_corrected=was_corrected,
        )

    def guard(self, action: str) -> Callable[..., Any]:
        """Decorator that wraps any Python agent tool function with AegisBrain enforcement."""

        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            @functools.wraps(func)
            def wrapper(**kwargs: Any) -> dict[str, Any]:
                intercept = self.check_action(action=action, params=kwargs)
                if not intercept.allowed:
                    raise PermissionError(
                        f"[AegisBrain {intercept.verdict}] Blocked by {intercept.policy_key}: {intercept.reason}"
                    )
                tool_output = func(**intercept.executed_params)
                return {
                    "tool_output": tool_output,
                    "aegis_verdict": intercept.verdict,
                    "auto_corrected": intercept.auto_corrected,
                    "original_agent_params": intercept.original_params,
                    "enforced_params": intercept.executed_params,
                    "gateway_latency_ms": round(intercept.latency_ms, 3),
                    "sha256_audit_hash": intercept.audit_hash,
                }

            return wrapper

        return decorator