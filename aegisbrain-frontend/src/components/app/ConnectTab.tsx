"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Zap } from "lucide-react";
import { API_BASE, ApiError, evaluate, pickKey, type EvaluateResponse } from "@/lib/api";
import type { Workspace } from "@/lib/workspace";
import CopyButton from "./CopyButton";
import { EASE, VERDICT, btnPrimary, card, codeBox, verdictOf } from "./styles";

type Lang = "python" | "langchain" | "node" | "curl";

function snippets(key: string): Record<Lang, string> {
  return {
    python: `import uuid, requests

GATEWAY = "${API_BASE}"
KEY = "${key}"

def check(action, params, agent_id="my_agent"):
    r = requests.post(
        f"{GATEWAY}/v1/evaluate",
        headers={"Authorization": f"Bearer {KEY}"},
        json={"request_id": str(uuid.uuid4()), "agent_id": agent_id,
              "action": action, "params": params},
        timeout=3,
    )
    r.raise_for_status()
    return r.json()

def refund(amount_inr, customer_id):
    verdict = check("refunds.create", {"amount_inr": amount_inr, "customer_id": customer_id})
    if verdict["decision"] != "allow":
        return {"stopped": verdict["reason"]}      # blocked or held for approval
    return real_refund_api(amount_inr, customer_id)  # your real tool`,
    langchain: `# Same check() as the Python tab. Wrap each tool before the agent can use it.
from langchain_core.tools import tool

@tool
def issue_refund(amount_inr: int, customer_id: str) -> str:
    """Issue a refund, only if the gateway allows it."""
    verdict = check("refunds.create", {"amount_inr": amount_inr, "customer_id": customer_id})
    if verdict["decision"] != "allow":
        return f"Stopped by policy: {verdict['reason']}"
    return real_refund_api(amount_inr, customer_id)`,
    node: `const GATEWAY = "${API_BASE}";
const KEY = "${key}";

export async function check(action, params, agentId = "my_agent") {
  const res = await fetch(\`\${GATEWAY}/v1/evaluate\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${KEY}\` },
    body: JSON.stringify({ request_id: crypto.randomUUID(), agent_id: agentId, action, params }),
  });
  if (!res.ok) throw new Error(\`Gateway error \${res.status}\`);
  return res.json(); // { decision: "allow" | "hold" | "deny", reason, ... }
}`,
    curl: `curl -X POST ${API_BASE}/v1/evaluate \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{"request_id":"test-1","agent_id":"my_agent","action":"refunds.create","params":{"amount_inr":8000,"customer_id":"c_9821"}}'`,
  };
}

const LANGS: { id: Lang; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "langchain", label: "LangChain" },
  { id: "node", label: "Node.js" },
  { id: "curl", label: "cURL" },
];

const PINGS = [
  { id: "refund", label: "Refund 8,000", agent: "support_bot_1", action: "refunds.create", params: { amount_inr: 8000, customer_id: "c_9821" } },
  { id: "d10", label: "10% discount", agent: "sales_bot_3", action: "discounts.apply", params: { discount_pct: 10, customer_tier: "regular", order_id: 881 } },
  { id: "d5", label: "5% discount", agent: "sales_bot_3", action: "discounts.apply", params: { discount_pct: 5, customer_tier: "regular", order_id: 882 } },
  { id: "vip", label: "VIP 10% discount", agent: "sales_bot_3", action: "discounts.apply", params: { discount_pct: 10, customer_tier: "vip", order_id: 902 } },
  { id: "order", label: "Dispatch order", agent: "ops_bot_2", action: "orders.update_status", params: { order_id: 88219, status: "DISPATCHED" } },
];

export default function ConnectTab({ ws }: { ws: Workspace }) {
  const runtimeKey = pickKey(ws.credentials, ["runtime"]);
  const [lang, setLang] = useState<Lang>("python");
  const [reveal, setReveal] = useState(false);
  const [ping, setPing] = useState(PINGS[0].id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ r: EvaluateResponse; rtt: number } | null>(null);

  const realKey = runtimeKey ?? "YOUR_RUNTIME_KEY";
  const shownKey = reveal || !runtimeKey ? realKey : realKey.slice(0, 9) + "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  const shown = snippets(shownKey)[lang];
  const full = snippets(realKey)[lang];

  async function send() {
    const p = PINGS.find((x) => x.id === ping) ?? PINGS[0];
    setBusy(true);
    setErr("");
    setRes(null);
    try {
      const { data, ms } = await evaluate(
        { request_id: `console-${Date.now()}`, agent_id: p.agent, action: p.action, params: p.params },
        runtimeKey
      );
      setRes({ r: data, rtt: ms });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const v = res ? VERDICT[verdictOf(res.r.decision)] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className={`${card} p-6 lg:col-span-7`}>
        <p className="font-display text-xl font-semibold tracking-tight">Connect your agents in three steps</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px] text-muted">
          <li>Put the check below in front of each tool your agent can use.</li>
          <li>If the answer is not &ldquo;allow&rdquo;, do not run the tool.</li>
          <li>Send a test ping on the right to see it work.</li>
        </ol>

        <div className="relative mt-5 inline-grid grid-cols-4 rounded-full border border-ice bg-mist p-1" role="tablist">
          {LANGS.map((l) => (
            <button
              key={l.id}
              role="tab"
              aria-selected={lang === l.id}
              onClick={() => setLang(l.id)}
              className="relative z-10 rounded-full px-4 py-2 text-sm font-medium"
            >
              {lang === l.id && (
                <motion.span
                  layoutId="lang-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              {l.label}
            </button>
          ))}
        </div>

        <div className={`${codeBox} mt-4 p-4`}>
          <AnimatePresence mode="wait">
            <motion.pre
              key={lang + reveal}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="max-h-[380px] overflow-auto whitespace-pre text-[12px] leading-relaxed"
            >
              {shown}
            </motion.pre>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <CopyButton text={full} label="Copy code" />
          {runtimeKey && (
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="inline-flex items-center gap-1.5 rounded-full border border-ice bg-white/85 px-3.5 py-2 text-sm font-medium transition hover:bg-white"
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {reveal ? "Hide key in code" : "Show key in code"}
            </button>
          )}
        </div>
        <p className="mt-4 text-sm text-muted">
          These are plain HTTP examples. There is no separate SDK yet.
          {!runtimeKey && " Add your runtime key where it says YOUR_RUNTIME_KEY."}
        </p>
      </div>

      <div className={`${card} p-6 lg:col-span-5`}>
        <p className="font-display text-xl font-semibold tracking-tight">Send a test ping</p>
        <p className="mt-1 text-sm text-muted">Sends one real request to your gateway and shows the answer.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {PINGS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPing(p.id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                ping === p.id ? "border-cobalt bg-cobalt text-white" : "border-ice bg-white/80 hover:bg-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={send} disabled={busy} className={`${btnPrimary} mt-5 w-full`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {busy ? "Asking the gateway" : "Send test ping"}
        </button>
        <p className="mt-3 min-h-[1.25rem] text-sm text-deny" role="alert" aria-live="polite">
          {err}
        </p>

        <AnimatePresence mode="wait">
          {res && v && (
            <motion.div
              key={res.r.request_id}
              initial={{ opacity: 0, y: 20, scale: 0.96, rotateX: -8 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: EASE }}
              style={{ transformPerspective: 1000 }}
              className={`mt-2 rounded-2xl border p-5 ${v.bg} ${v.border}`}
            >
              <p className={`font-display text-3xl font-semibold tracking-tight ${v.text}`}>{v.label}</p>
              {res.r.reason && <p className="mt-2 text-[15px]">{res.r.reason}</p>}
              <dl className="mt-4 grid grid-cols-[6.5rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-muted">Rule</dt>
                <dd className="font-mono text-[13px]">{res.r.policy_key ?? "none matched"}</dd>
                <dt className="text-muted">Gateway time</dt>
                <dd className="font-mono text-[13px]">
                  {typeof res.r.latency_ms === "number" ? `${res.r.latency_ms.toFixed(2)} ms` : "n/a"}
                </dd>
                <dt className="text-muted">Round trip</dt>
                <dd className="font-mono text-[13px]">{res.rtt.toFixed(0)} ms</dd>
                {res.r.audit_hash && (
                  <>
                    <dt className="text-muted">Record</dt>
                    <dd className="truncate font-mono text-[13px]">{res.r.audit_hash.slice(0, 20)}&hellip;</dd>
                  </>
                )}
              </dl>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
