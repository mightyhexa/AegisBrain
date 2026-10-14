"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { CheckCircle2, Loader2, Radio, ShieldCheck, XCircle } from "lucide-react";
import { ApiError, asList, listActivePolicies, listDecisions, pick, pickKey, verifyAudit } from "@/lib/api";
import type { Workspace } from "@/lib/workspace";
import JsonTree from "./JsonTree";
import { EASE, VERDICT, btnGhost, card, verdictOf } from "./styles";

type Row = { id: string; action: string; agent: string; decision: string; policy: string; ms: string; at: string; hash: string };

function norm(d: Record<string, unknown>, i: number): Row {
  const ms = d.latency_ms;
  return {
    id: pick(d, "id", "decision_id", "request_id", "audit_hash") || String(i),
    action: pick(d, "action"),
    agent: pick(d, "agent_id", "agent"),
    decision: pick(d, "decision", "verdict") || "hold",
    policy: pick(d, "policy_key", "policy"),
    ms: typeof ms === "number" ? `${ms.toFixed(2)} ms` : "",
    at: pick(d, "evaluated_at", "created_at", "timestamp", "ts"),
    hash: pick(d, "audit_hash", "hash"),
  };
}

function Counter({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  useEffect(() => {
    const c = animate(last.current, to, {
      duration: 0.7,
      ease: EASE,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = String(Math.round(v));
      },
    });
    last.current = to;
    return () => c.stop();
  }, [to]);
  return <span ref={ref}>0</span>;
}

function chainOk(r: Record<string, unknown>): boolean | null {
  for (const k of ["valid", "ok", "verified", "chain_valid", "all_valid", "intact"]) {
    if (typeof r[k] === "boolean") return r[k] as boolean;
  }
  const s = typeof r.status === "string" ? r.status.toLowerCase() : "";
  if (["ok", "valid", "verified", "intact"].includes(s)) return true;
  if (["invalid", "broken", "failed", "tampered"].includes(s)) return false;
  return null;
}

export default function TelemetryTab({ ws }: { ws: Workspace }) {
  const key = pickKey(ws.credentials, ["policy_reader", "policy_admin", "tenant_admin", "runtime"]);
  const [live, setLive] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [policies, setPolicies] = useState<Record<string, unknown>[]>([]);
  const [err, setErr] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<{ ok: boolean | null; raw: Record<string, unknown> } | null>(null);
  const [verr, setVerr] = useState("");

  useEffect(() => {
    listActivePolicies(key)
      .then((r) => setPolicies(asList(r.data)))
      .catch(() => undefined);
  }, [key]);

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const load = async () => {
      try {
        const { data } = await listDecisions(15, key);
        if (stop) return;
        setRows(asList(data).map(norm));
        setErr("");
      } catch (e) {
        if (!stop) setErr(e instanceof ApiError ? e.message : "Could not load decisions.");
      }
    };
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [live, key]);

  async function verify() {
    setVerifying(true);
    setVerr("");
    setVerified(null);
    const minWait = new Promise((r) => setTimeout(r, 1400)); // lets the sweep play
    try {
      const [{ data }] = await Promise.all([verifyAudit(key), minWait]);
      setVerified({ ok: chainOk(data), raw: data });
    } catch (e) {
      await minWait;
      setVerr(e instanceof ApiError ? e.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  const counts = { allow: 0, hold: 0, deny: 0 };
  rows.forEach((r) => (counts[verdictOf(r.decision)] += 1));

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className={`${card} p-6 lg:col-span-7`}>
        <div className="flex items-center justify-between">
          <p className="font-display text-xl font-semibold tracking-tight">Live decisions</p>
          <button
            onClick={() => setLive((l) => !l)}
            className="inline-flex items-center gap-2 rounded-full border border-ice bg-white/85 px-3.5 py-1.5 text-sm font-medium"
          >
            <span className="relative flex h-2.5 w-2.5">
              {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-allow/60" />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-allow" : "bg-muted"}`} />
            </span>
            {live ? "Live" : "Paused"}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {(["allow", "hold", "deny"] as const).map((k) => (
            <div key={k} className={`rounded-2xl border px-4 py-3 ${VERDICT[k].bg} ${VERDICT[k].border}`}>
              <p className={`font-display text-3xl font-semibold ${VERDICT[k].text}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                <Counter to={counts[k]} />
              </p>
              <p className="text-xs text-muted">{VERDICT[k].label}</p>
            </div>
          ))}
        </div>

        {err && <p className="mt-4 rounded-xl border border-deny/30 bg-deny/10 px-4 py-3 text-sm">{err}</p>}

        <ul className="mt-4 divide-y divide-ice">
          <AnimatePresence initial={false}>
            {rows.map((r) => {
              const v = VERDICT[verdictOf(r.decision)];
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, x: -24, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-3 py-3">
                    <span className={`w-28 shrink-0 rounded-full border px-3 py-1 text-center text-xs font-semibold ${v.bg} ${v.border} ${v.text}`}>
                      {v.label.split(" ")[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[13px]">{r.action || "action"}</p>
                      <p className="truncate text-xs text-muted">
                        {[r.agent, r.policy, r.at && new Date(r.at).toLocaleTimeString()].filter(Boolean).join(" \u00b7 ")}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted">{r.ms}</span>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {rows.length === 0 && !err && <p className="py-8 text-center text-muted">No decisions yet. Send a test ping from the Connect tab.</p>}
      </div>

      <div className="space-y-6 lg:col-span-5">
        <div className={`${card} p-6`}>
          <p className="font-display text-xl font-semibold tracking-tight">Check the record is untouched</p>
          <p className="mt-1 text-sm text-muted">Re-computes the chain of fingerprints behind every decision.</p>
          <button onClick={verify} disabled={verifying} className={`${btnGhost} mt-4 w-full`}>
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {verifying ? "Checking" : "Verify now"}
          </button>

          <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-mist">
            {verifying && (
              <motion.div
                className="absolute inset-y-0 w-1/3 rounded-full bg-cobalt"
                initial={{ left: "-33%" }}
                animate={{ left: "100%" }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </div>

          <p className="mt-3 min-h-[1.25rem] text-sm text-deny" role="alert">
            {verr}
          </p>
          <AnimatePresence>
            {verified && (
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="mt-2 space-y-3"
              >
                <p
                  className={`flex items-center gap-2 font-display text-2xl font-semibold ${
                    verified.ok === false ? "text-deny" : verified.ok ? "text-allow" : "text-ink"
                  }`}
                >
                  {verified.ok === false ? <XCircle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                  {verified.ok === false ? "Record has been changed" : verified.ok ? "Record is intact" : "Result"}
                </p>
                <JsonTree data={verified.raw} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={`${card} p-6`}>
          <p className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
            <Radio className="h-5 w-5 text-cobalt" /> Rules in force
          </p>
          {policies.length === 0 ? (
            <p className="mt-3 text-muted">No active rules loaded.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ice">
              {policies.slice(0, 12).map((p, i) => (
                <li key={i} className="py-3">
                  <p className="font-mono text-[13px]">{pick(p, "policy_key", "key", "id") || "rule"}</p>
                  <p className="text-xs text-muted">
                    {[pick(p, "action"), pick(p, "effect", "decision"), pick(p, "version") && `v${pick(p, "version")}`]
                      .filter(Boolean)
                      .join(" \u00b7 ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
