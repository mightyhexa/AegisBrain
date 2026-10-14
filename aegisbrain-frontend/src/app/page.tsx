"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Instrument_Serif } from "next/font/google";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  Fingerprint,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

import Logo from "@/components/marketing/Logo";
import LiveBackground from "./LiveBackground";
import { faqs } from "@/lib/faq";

/* ------------------------------------------------------------------ */
/* Editorial Serif Font & GPU Motion Keyframes                        */
/* ------------------------------------------------------------------ */

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const HOME_MOTION_CSS = `
@keyframes ab-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@keyframes ab-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes ab-spin-rev {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(-360deg); }
}
@keyframes ab-wheel-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes ab-wheel-counter {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}
@keyframes ab-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes ab-shine {
  from { transform: translateX(-130%) skewX(-18deg); }
  to { transform: translateX(260%) skewX(-18deg); }
}
@keyframes ab-ring {
  0% { transform: scale(1); opacity: 0.55; }
  100% { transform: scale(2.4); opacity: 0; }
}
@keyframes ab-cue {
  0% { transform: scaleY(0); transform-origin: top; }
  50% { transform: scaleY(1); transform-origin: top; }
  50.01% { transform: scaleY(1); transform-origin: bottom; }
  100% { transform: scaleY(0); transform-origin: bottom; }
}
.ab-marquee { animation: ab-marquee 52s linear infinite; will-change: transform; }
.ab-marquee:hover { animation-play-state: paused; }
.ab-orbit { animation: ab-spin 40s linear infinite; will-change: transform; }
.ab-orbit-chip { animation: ab-spin-rev 40s linear infinite; will-change: transform; }
.ab-wheel { animation: ab-wheel-spin 46s linear infinite; will-change: transform; }
.ab-wheel:hover { animation-play-state: paused; }
.ab-wheel-item { animation: ab-wheel-counter 46s linear infinite; will-change: transform; }
.ab-wheel:hover .ab-wheel-item { animation-play-state: paused; }
.ab-float { animation: ab-float 6s ease-in-out infinite; will-change: transform; }
.ab-shine-wrap:hover .ab-shine { animation: ab-shine 0.9s ease; }
.ab-ring { animation: ab-ring 2.2s ease-out infinite; }
.ab-cue { animation: ab-cue 2.4s ease-in-out infinite; }
.ab-conic { animation: ab-spin 30s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .ab-marquee, .ab-orbit, .ab-orbit-chip, .ab-wheel, .ab-wheel-item, .ab-float, .ab-ring, .ab-cue, .ab-conic {
    animation: none !important;
  }
}
`;

/* ------------------------------------------------------------------ */
/* Constants, Types & Deterministic Gateway Logic                     */
/* ------------------------------------------------------------------ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const FOUNDER_NAME = "Mohammed Fahad Ali";
const FOUNDER_EMAIL = "mdfahadali.in@gmail.com";
const FOUNDER_PHONE = "+91 91216 13624";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_DRAMATIC: [number, number, number, number] = [0.76, 0, 0.24, 1];

export const VERDICT = {
  allow: {
    label: "Allowed",
    text: "text-allow",
    bg: "bg-allow/10",
    border: "border-allow/30",
    hex: "#0F9D6B",
  },
  hold: {
    label: "Held",
    text: "text-hold",
    bg: "bg-hold/10",
    border: "border-hold/30",
    hex: "#B7791F",
  },
  deny: {
    label: "Blocked",
    text: "text-deny",
    bg: "bg-deny/10",
    border: "border-deny/30",
    hex: "#D42B4D",
  },
} as const;

export type VerdictKey = keyof typeof VERDICT;
type VerdictUpper = "ALLOW" | "HOLD" | "DENY";
type Params = Record<string, string | number>;
type AgentCall = { agent: string; action: string; params: Params };

type Rule = {
  id: string;
  title: string;
  action: string;
  field: string;
  op: ">" | "<" | "==";
  threshold: number;
  vipOnly?: boolean;
  effect: VerdictUpper;
  priority: number;
  summary: string;
  source: string;
  reason: string;
};

type Decision = {
  requestId: string;
  agent: string;
  action: string;
  params: Params;
  correctedParams: Params | null;
  verdict: VerdictUpper;
  ruleId: string | null;
  summary: string | null;
  source: string | null;
  reason: string;
  correctionNote: string | null;
  ms: number;
  auditHash: string;
  via: "live gateway" | "policy engine";
  at: string;
};

type PendingVerification = {
  id: string;
  channel: "Slack #leadership" | "WhatsApp Executive Group" | "Gmail Policy Thread";
  rawAnnouncement: string;
  plainSummary: string;
  proposedRule: Rule;
  notifyVia: "gmail" | "whatsapp";
  managerTarget: string;
  approvalUrl?: string;
  externalSent?: boolean;
  createdAt: string;
};

type ManagerProfile = {
  fullName: string;
  companyName: string;
  authMethod: "gmail" | "phone";
  identifier: string;
  roleTitle: string;
  tenantId: string;
  sdkKey: string;
  charterSentLive?: boolean;
};

const INITIAL_RULES: Rule[] = [
  {
    id: "refund_cap_v1",
    title: "Maximum Auto-Refund Limit",
    action: "refunds.create",
    field: "amount_inr",
    op: ">",
    threshold: 5000,
    effect: "HOLD",
    priority: 10,
    summary: "Refunds above ₹5,000 require manager sign-off",
    source: "Slack #finance · Approved by Priya",
    reason: "Refunds above ₹5,000 need a manager's approval. Held in quarantine.",
  },
  {
    id: "promo_cap_v2",
    title: "Promotional Discount Ceiling",
    action: "discounts.apply",
    field: "discount_pct",
    op: ">",
    threshold: 5,
    effect: "DENY",
    priority: 10,
    summary: "Customer discounts are capped at 5%",
    source: "Slack #policy-updates · Approved by Priya",
    reason: "Discounts above 5% are blocked. Auto-correcting agent to 5% cap.",
  },
  {
    id: "promo_vip_exception_v1",
    title: "VIP Customer Discount Hold",
    action: "discounts.apply",
    field: "discount_pct",
    op: ">",
    threshold: 5,
    vipOnly: true,
    effect: "HOLD",
    priority: 20,
    summary: "VIP discounts above 5% go to manager approval",
    source: "Slack #policy-updates · Approved by Priya",
    reason: "VIP discount exceeds 5% cap. Held for one-time manager release.",
  },
];

type Scenario = {
  id: string;
  title: string;
  who: string;
  note: string;
  badge: string;
  call: AgentCall;
};

const SCENARIOS: Scenario[] = [
  {
    id: "refund",
    title: "Refund ₹8,000 to Customer",
    who: "Support agent",
    note: "More than the ₹5,000 an agent may refund alone",
    badge: "Quarantine Hold",
    call: {
      agent: "support_bot_1",
      action: "refunds.create",
      params: { amount_inr: 8000, customer_id: "c_9821" },
    },
  },
  {
    id: "discount_regular",
    title: "10% discount for a regular customer",
    who: "Sales agent",
    note: "Outdated agent trying 10% when cap is 5%",
    badge: "Auto-Correct",
    call: {
      agent: "sales_bot_3",
      action: "discounts.apply",
      params: { discount_pct: 10, customer_tier: "regular", order_id: 881 },
    },
  },
  {
    id: "discount_vip",
    title: "10% discount for a VIP customer",
    who: "Sales agent",
    note: "VIP exceptions go to a manager",
    badge: "VIP Escalation",
    call: {
      agent: "sales_bot_3",
      action: "discounts.apply",
      params: { discount_pct: 10, customer_tier: "vip", order_id: 902 },
    },
  },
  {
    id: "order",
    title: "Mark order 88219 as dispatched",
    who: "Fulfilment agent",
    note: "No rule blocks this one",
    badge: "Zero-Friction Allow",
    call: {
      agent: "ops_bot_2",
      action: "orders.update_status",
      params: { order_id: 88219, status: "DISPATCHED" },
    },
  },
];

const VERDICT_UPPER_UI: Record<
  VerdictUpper,
  { label: string; text: string; bg: string; border: string }
> = {
  ALLOW: {
    label: "Approved & Executed",
    text: "text-allow",
    bg: "bg-allow/10",
    border: "border-allow/30",
  },
  HOLD: {
    label: "Held for Manager",
    text: "text-hold",
    bg: "bg-hold/10",
    border: "border-hold/30",
  },
  DENY: {
    label: "Intercepted & Auto-Corrected",
    text: "text-deny",
    bg: "bg-deny/10",
    border: "border-deny/30",
  },
};

function matchesRule(rule: Rule, call: AgentCall): boolean {
  if (rule.action !== call.action) return false;
  if (rule.vipOnly && String(call.params.customer_tier ?? "").toLowerCase() !== "vip") {
    return false;
  }
  const actual = Number(call.params[rule.field]);
  const expected = Number(rule.threshold);
  if (Number.isNaN(actual) || Number.isNaN(expected)) return false;
  if (rule.op === ">") return actual > expected;
  if (rule.op === "<") return actual < expected;
  return actual === expected;
}

function quickHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${hex(h1)}${hex(h2)}${hex(h1 ^ 0x9e3779b9)}${hex(h2 ^ 0x85ebca6b)}${hex(
    h1 + h2
  )}${hex(h1 ^ h2)}${hex(h2)}${hex(h1)}`;
}

function buildFounderWelcomeMessage(profile: ManagerProfile): string {
  return (
    `🛡️ *WELCOME TO AEGISBRAIN — OFFICIAL COLLABORATION CHARTER*\n\n` +
    `Dear *${profile.fullName}* (${profile.roleTitle}),\n` +
    `Thank you for collaborating with *AegisBrain*. Your enterprise policy gateway for *${profile.companyName}* is now live.\n\n` +
    `📋 *Executed Contract Summary:*\n` +
    `• *Partner Organization:* ${profile.companyName}\n` +
    `• *Isolated Tenant ID:* ${profile.tenantId}\n` +
    `• *Verified Decision-Maker:* ${profile.identifier}\n` +
    `• *Active Protection:* Sub-millisecond AST Auto-Correction + SHA-256 Audit Ledger\n\n` +
    `Whenever you announce a policy change in Slack, WhatsApp, or Gmail, AegisBrain will send you a 1-tap verification before syncing all AI agents.\n\n` +
    `Warm regards,\n` +
    `*${FOUNDER_NAME}*\n` +
    `Founder & Lead Architect, AegisBrain\n` +
    `📧 ${FOUNDER_EMAIL} | 📞 ${FOUNDER_PHONE}`
  );
}

function triggerDirectCharterShare(profile: ManagerProfile, via: "gmail" | "whatsapp") {
  const text = buildFounderWelcomeMessage(profile);
  const subject = encodeURIComponent(
    `Welcome to AegisBrain · Official Collaboration Charter for ${profile.companyName}`
  );
  const body = encodeURIComponent(text.replace(/\*/g, ""));
  if (via === "gmail") {
    const targetEmail = profile.identifier.includes("@") ? profile.identifier : "";
    window.open(
      `mailto:${targetEmail}?cc=${FOUNDER_EMAIL}&subject=${subject}&body=${body}`,
      "_blank"
    );
  } else {
    let digits = profile.identifier.replace(/[^0-9]/g, "");
    if (digits.length === 10) digits = `91${digits}`;
    const waUrl = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  }
}

function evaluateWithRules(call: AgentCall, rules: Rule[]): Decision {
  const t0 = performance.now();
  const hits = rules.filter((r) => matchesRule(r, call));
  hits.sort(
    (a, b) =>
      b.priority - a.priority || Number(b.effect === "DENY") - Number(a.effect === "DENY")
  );
  const top = hits[0];
  const ms = Math.max(0.31, performance.now() - t0);
  const at = new Date().toISOString();
  const requestId = `req-${Date.now()}`;
  const hash = quickHash(
    `${requestId}|${call.agent}|${call.action}|${JSON.stringify(call.params)}|${at}`
  );

  if (!top) {
    return {
      requestId,
      agent: call.agent,
      action: call.action,
      params: call.params,
      correctedParams: null,
      verdict: "ALLOW",
      ruleId: null,
      summary: null,
      source: null,
      reason: "Policy verified. Action matches current company rules and proceeded smoothly.",
      correctionNote: null,
      ms,
      auditHash: hash,
      via: "policy engine",
      at,
    };
  }

  const corrected: Params = { ...call.params, [top.field]: top.threshold };
  const unit = top.field === "discount_pct" ? "%" : "₹";
  const formattedThreshold =
    top.field === "discount_pct"
      ? `${top.threshold}%`
      : `₹${Number(top.threshold).toLocaleString("en-IN")}`;

  return {
    requestId,
    agent: call.agent,
    action: call.action,
    params: call.params,
    correctedParams: corrected,
    verdict: top.effect,
    ruleId: top.id,
    summary: top.summary,
    source: top.source,
    reason: top.reason,
    correctionNote: `Agent sent outdated parameter (${top.field}: ${call.params[top.field]}${
      unit === "%" ? "%" : ""
    }). AegisBrain intercepted it in ${ms.toFixed(
      2
    )} ms and enforced the active ${formattedThreshold} policy cap.`,
    ms,
    auditHash: hash,
    via: "policy engine",
    at,
  };
}

async function evaluateGateway(call: AgentCall, rules: Rule[]): Promise<Decision> {
  const localCheck = evaluateWithRules(call, rules);
  try {
    const res = await fetch(`${API_BASE}/v1/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: localCheck.requestId,
        agent_id: call.agent,
        action: call.action,
        params: call.params,
      }),
      signal: AbortSignal.timeout(2200),
    });
    if (!res.ok) return localCheck;
    const j = await res.json();
    return {
      ...localCheck,
      requestId: j.request_id ?? localCheck.requestId,
      ms: typeof j.latency_ms === "number" ? j.latency_ms : localCheck.ms,
      auditHash: j.audit_hash ?? localCheck.auditHash,
      via: "live gateway",
    };
  } catch {
    return localCheck;
  }
}

/* ------------------------------------------------------------------ */
/* Shared Primitives from Claude's Design System (parts.tsx)          */
/* ------------------------------------------------------------------ */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <motion.span
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: EASE }}
        className="h-px w-10 origin-left bg-cobalt"
      />
      <span className="text-sm font-medium tracking-wide text-cobalt">{children}</span>
    </div>
  );
}

function SplitWords({
  text,
  className = "",
  delay = 0,
  italic = [],
}: {
  text: string;
  className?: string;
  delay?: number;
  italic?: string[];
}) {
  const words = text.split(" ");
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      {words.map((w, i) => {
        const isItalic = italic.includes(w);
        return (
          <span
            key={i}
            className={`inline-block overflow-hidden pb-[0.18em] pt-[0.06em] align-bottom ${
              isItalic ? "pr-[0.24em] -mr-[0.16em]" : "pr-[0.06em] -mr-[0.04em]"
            }`}
            aria-hidden="true"
          >
            <motion.span
              className={`inline-block will-change-transform ${
                isItalic
                  ? `${serif.className} font-normal italic text-cobalt text-[1.08em]`
                  : ""
              }`}
              initial={{ y: "118%", rotate: 5 }}
              whileInView={{ y: "0%", rotate: 0 }}
              viewport={{ once: true, margin: "-8%" }}
              transition={{ duration: 0.9, ease: EASE, delay: delay + i * 0.055 }}
            >
              {w}
            </motion.span>
            {i < words.length - 1 ? "\u00a0" : ""}
          </span>
        );
      })}
    </span>
  );
}

function Magnetic({
  children,
  strength = 0.3,
  className = "",
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.3 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.3 });

  return (
    <motion.div
      ref={ref}
      className={`inline-block ${className}`}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

function Chars({ text, base }: { text: string; base: number }) {
  const words = text.split(" ");
  let n = 0;
  return (
    <span
      className="block overflow-hidden pb-[0.14em] pt-[0.08em]"
      style={{ perspective: 800 }}
    >
      {words.map((w, wi) => (
        <span key={wi} className="inline-block whitespace-nowrap">
          {w.split("").map((c, ci) => {
            const i = n++;
            return (
              <motion.span
                key={ci}
                className="inline-block cursor-default"
                style={{ transformOrigin: "50% 100%" }}
                initial={{ y: "125%", rotateX: -85 }}
                animate={{ y: "0%", rotateX: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: base + i * 0.028 }}
                whileHover={{
                  y: -7,
                  color: "#2B54F0",
                  transition: { type: "spring", stiffness: 500, damping: 14 },
                }}
              >
                {c}
              </motion.span>
            );
          })}
          {wi < words.length - 1 && <span className="inline-block w-[0.26em]" />}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Section 1: Hero + 3D TiltConsole with Orbiting Source Chips        */
/* ------------------------------------------------------------------ */

const HERO_EVENTS: {
  agent: string;
  action: string;
  detail: string;
  verdict: VerdictKey;
  rule: string;
}[] = [
  {
    agent: "sales_bot_3",
    action: "discounts.apply",
    detail: "10% off, regular customer",
    verdict: "deny",
    rule: "promo_cap_v2",
  },
  {
    agent: "support_bot_1",
    action: "refunds.create",
    detail: "₹8,000 refund",
    verdict: "hold",
    rule: "refund_cap_v1",
  },
  {
    agent: "sales_bot_3",
    action: "discounts.apply",
    detail: "5% off, regular customer",
    verdict: "allow",
    rule: "promo_cap_v2",
  },
  {
    agent: "ops_bot_2",
    action: "orders.update_status",
    detail: "mark order dispatched",
    verdict: "allow",
    rule: "no rule blocks this",
  },
];

function TiltConsole() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 140, damping: 16, mass: 0.4 });
  const sry = useSpring(ry, { stiffness: 140, damping: 16, mass: 0.4 });
  const e = HERO_EVENTS[i];
  const v = VERDICT[e.verdict];

  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % HERO_EVENTS.length), 3600);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="relative mx-auto w-full max-w-[460px]"
      style={{ perspective: 1200 }}
      onPointerMove={(ev) => {
        if (reduce) return;
        const r = ev.currentTarget.getBoundingClientRect();
        ry.set(((ev.clientX - r.left) / r.width - 0.5) * 18);
        rx.set(((ev.clientY - r.top) / r.height - 0.5) * -14);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
    >
      {/* Slow orbit of message sources */}
      <div
        className="ab-orbit pointer-events-none absolute -inset-10 rounded-full border border-dashed border-ice"
        aria-hidden="true"
      >
        {[
          { l: "50%", t: "0%", label: "Slack" },
          { l: "93%", t: "75%", label: "Email" },
          { l: "7%", t: "75%", label: "WhatsApp" },
        ].map((c) => (
          <span
            key={c.label}
            className="ab-orbit-chip absolute rounded-full border border-white/90 bg-white/95 px-3.5 py-1.5 text-xs font-medium text-ink shadow-[0_10px_24px_-8px_rgba(43,84,240,0.35)]"
            style={{ left: c.l, top: c.t }}
          >
            {c.label}
          </span>
        ))}
      </div>

      <motion.div
        className="relative rounded-[32px] border border-white/90 bg-gradient-to-b from-white to-[#EAF1FF] p-6"
        style={{
          rotateX: srx,
          rotateY: sry,
          transformStyle: "preserve-3d",
          boxShadow:
            "0 60px 100px -30px rgba(43,84,240,0.45), 0 14px 34px rgba(11,26,51,0.10)",
        }}
        initial={{ opacity: 0, y: 70, rotateX: 24, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
        transition={{ duration: 1.3, ease: EASE, delay: 0.45 }}
      >
        <div
          className="flex items-center justify-between"
          style={{ transform: "translateZ(20px)" }}
        >
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-deny/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-hold/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-allow/70" />
          </div>
          <span className="text-xs text-muted">Gateway, live preview</span>
        </div>

        <div className="mt-6" style={{ transform: "translateZ(40px)" }}>
          <p className="text-xs text-muted">An agent asks to act</p>
          <AnimatePresence mode="wait">
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 18, rotateX: -20 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              exit={{ opacity: 0, y: -14, rotateX: 18 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="mt-2 rounded-2xl border border-ice bg-white/85 p-4 font-mono text-[13px] leading-relaxed shadow-sm"
            >
              <p className="text-cobalt">{e.agent}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{e.action}</p>
              <p className="text-muted">{e.detail}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div
          className="relative mt-6 h-1.5 overflow-hidden rounded-full bg-mist"
          style={{ transform: "translateZ(30px)" }}
        >
          <motion.div
            key={i}
            className="h-full origin-left rounded-full bg-cobalt"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, ease: "easeInOut" }}
          />
        </div>

        <div className="relative mt-6 h-24" style={{ transform: "translateZ(70px)" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={i}
              className="absolute inset-0 flex items-center justify-between gap-4"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              <div className="min-w-0">
                <p className="text-xs text-muted">Rule applied</p>
                <p className="truncate font-mono text-[13px] text-ink">{e.rule}</p>
              </div>
              <motion.div
                className={`shrink-0 rounded-2xl border-[3px] px-5 py-2.5 font-display text-2xl font-semibold uppercase tracking-wide ${v.text} ${v.bg} ${v.border}`}
                initial={{ scale: 2.4, rotate: -16, opacity: 0 }}
                animate={{ scale: 1, rotate: -5, opacity: 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 17, delay: 0.85 }}
              >
                {v.label}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function HeroSection({ onOpenPortal }: { onOpenPortal: () => void }) {
  const { scrollY } = useScroll();
  const yText = useTransform(scrollY, [0, 700], [0, -70]);
  const yCard = useTransform(scrollY, [0, 700], [0, 60]);

  return (
    <section className="relative mx-auto max-w-7xl px-6 pb-24 pt-12 md:pt-20">
      <div className="grid items-center gap-16 lg:grid-cols-12">
        <motion.div className="lg:col-span-7" style={{ y: yText }}>
          <motion.p
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/90 bg-white/80 px-4 py-1.5 text-sm text-muted shadow-sm backdrop-blur-md"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
          >
            <span className="relative flex h-2 w-2">
              <span className="ab-ring absolute inline-flex h-full w-full rounded-full bg-cobalt/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cobalt" />
            </span>
            Early access. Now onboarding pilot teams.
          </motion.p>

          <h1
            className="font-display font-semibold tracking-[-0.04em] text-ink"
            style={{ fontSize: "clamp(2.7rem, 7.2vw, 6.2rem)", lineHeight: 0.98 }}
          >
            <span className="sr-only">Your agents follow the rules you decided today.</span>
            <span aria-hidden="true">
              <Chars text="Your agents follow" base={0.15} />
              <Chars text="the rules you decided" base={0.42} />
              <span className="block overflow-hidden pb-[0.18em]">
                <motion.span
                  className={`${serif.className} inline-block italic text-cobalt`}
                  style={{ fontSize: "1.12em", lineHeight: 0.95 }}
                  initial={{ y: "120%", skewY: 8 }}
                  animate={{ y: "0%", skewY: 0 }}
                  transition={{ duration: 1.1, ease: EASE, delay: 0.78 }}
                >
                  today.
                </motion.span>
              </span>
            </span>
          </h1>

          <motion.p
            className="mt-8 max-w-xl text-lg leading-relaxed text-muted md:text-xl"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE, delay: 1.0 }}
          >
            AegisBrain turns decisions made in chat into approved rules, then checks every action
            your AI agents take before it happens.
          </motion.p>

          <motion.div
            className="mt-10 flex flex-wrap items-center gap-7"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: EASE, delay: 1.15 }}
          >
            <Magnetic strength={0.35}>
              <button
                type="button"
                onClick={onOpenPortal}
                className="ab-shine-wrap relative inline-block overflow-hidden rounded-full bg-cobalt px-8 py-4 font-medium text-white shadow-[0_18px_40px_-12px_rgba(43,84,240,0.7)]"
              >
                <span
                  className="ab-shine absolute inset-y-0 left-0 w-1/3 bg-white/30"
                  aria-hidden="true"
                />
                <span className="relative">Talk to us · Manager Portal</span>
              </button>
            </Magnetic>

            <a href="#how" className="group relative font-medium text-ink">
              See how it works
              <span className="absolute -bottom-1.5 left-0 h-[2px] w-full origin-left scale-x-[0.25] bg-cobalt transition-transform duration-500 group-hover:scale-x-100" />
            </a>
          </motion.div>
        </motion.div>

        <motion.div className="lg:col-span-5" style={{ y: yCard }}>
          <TiltConsole />
        </motion.div>
      </div>

      <div
        className="mt-20 hidden items-center gap-3 text-sm text-muted md:flex"
        aria-hidden="true"
      >
        <span className="relative block h-10 w-px overflow-hidden bg-ice">
          <span className="ab-cue absolute inset-0 bg-cobalt" />
        </span>
        Scroll
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 2: Infinite Pause-on-Hover Decision Ticker                 */
/* ------------------------------------------------------------------ */

const TICKER_ITEMS: [VerdictKey, string, string][] = [
  ["deny", "discounts.apply", "10% off, regular customer"],
  ["allow", "discounts.apply", "5% off"],
  ["hold", "refunds.create", "₹8,000 refund"],
  ["allow", "orders.update_status", "mark dispatched"],
  ["hold", "discounts.apply", "VIP, 10% off"],
  ["deny", "refunds.create", "digital goods, after cutoff"],
  ["allow", "refunds.create", "₹2,500 refund"],
];

function TickerRow({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center gap-4 pr-4" aria-hidden={hidden}>
      {TICKER_ITEMS.map(([k, a, d], i) => {
        const v = VERDICT[k];
        return (
          <li
            key={i}
            className="flex items-center gap-3 rounded-full border border-white/90 bg-white/85 py-2.5 pl-3 pr-5 shadow-sm backdrop-blur-md"
          >
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${v.text} ${v.bg} ${v.border}`}
            >
              {v.label}
            </span>
            <span className="font-mono text-[13px] text-ink">{a}</span>
            <span className="text-sm text-muted">{d}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Ticker() {
  return (
    <section className="relative py-6" aria-label="Example decisions">
      <p className="mx-auto mb-4 max-w-7xl px-6 text-sm text-muted">
        Example decisions, as the gateway would answer them
      </p>
      <div
        className="overflow-hidden"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        }}
      >
        <div className="ab-marquee flex w-max">
          <TickerRow />
          <TickerRow hidden />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 3: Smoothly Auto-Rotating Bluish-White Cards Wheel         */
/* (Inspired by your Cards Animation reference image)                 */
/* ------------------------------------------------------------------ */

const ORBITAL_CARDS = [
  {
    id: "syntax",
    angle: 0,
    tag: "Rule Compiler",
    title: "Plain English to AST",
    detail: "Turns natural Slack & WhatsApp messages into deterministic conditions.",
    kind: "type" as const,
  },
  {
    id: "curve",
    angle: 45,
    tag: "Latency Curve",
    title: "0.38 ms p99 Check",
    detail: "Pure Python AST evaluation with zero LLM calls in the hot path.",
    kind: "wave" as const,
  },
  {
    id: "gauge",
    angle: 90,
    tag: "Active Cap",
    title: "5% Promo Ceiling",
    detail: "Outdated agents requesting 10% or 15% are automatically rewritten to 5%.",
    kind: "gauge" as const,
  },
  {
    id: "split",
    angle: 135,
    tag: "Two-Person Hold",
    title: "Quarantine Token",
    detail: "High-value refunds wait for a single-use HMAC manager release token.",
    kind: "split" as const,
  },
  {
    id: "symmetry",
    angle: 180,
    tag: "Role Scope",
    title: "Authority Matrix",
    detail: "Verifies sender role before a single policy draft is ever compiled.",
    kind: "axis" as const,
  },
  {
    id: "version",
    angle: 225,
    tag: "Immutable Version",
    title: "Revision #21",
    detail: "Every rule change increments the version and links the original message.",
    kind: "number" as const,
  },
  {
    id: "glow",
    angle: 270,
    tag: "Shadow Mode",
    title: "Zero-Risk Pilot",
    detail: "Observe what AegisBrain would have blocked for 2 weeks before enforcing.",
    kind: "aura" as const,
  },
  {
    id: "nodes",
    angle: 315,
    tag: "Audit Chain",
    title: "SHA-256 Constellation",
    detail: "Every decision is cryptographically linked to the hash before it.",
    kind: "dots" as const,
  },
];

function OrbitalCardFace({
  kind,
  active,
}: {
  kind: (typeof ORBITAL_CARDS)[number]["kind"];
  active: boolean;
}) {
  const ringBorder = active
    ? "border-cobalt shadow-[0_26px_55px_-16px_rgba(43,84,240,0.42)] scale-105"
    : "border-white/95 shadow-[0_20px_45px_-18px_rgba(43,84,240,0.25)] hover:scale-105";

  return (
    <div
      className={`relative flex h-32 w-32 flex-col items-center justify-center overflow-hidden rounded-[28px] border bg-gradient-to-b from-white via-[#F4F8FF] to-[#E3EEFF] p-3.5 transition-all duration-300 md:h-36 md:w-36 ${ringBorder}`}
    >
      {/* Subtle blueprint grid texture inside bluish cards */}
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            "linear-gradient(to right, #D8E6FC 1px, transparent 1px), linear-gradient(to bottom, #D8E6FC 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />

      {kind === "type" && (
        <div className="relative text-center">
          <p className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            AaBbCc
          </p>
          <span className="mt-1.5 inline-block rounded-full bg-cobalt/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-cobalt">
            AST · v2
          </span>
        </div>
      )}

      {kind === "wave" && (
        <svg viewBox="0 0 100 64" className="relative h-16 w-24">
          <path
            d="M 6 48 Q 28 8, 50 34 T 94 18"
            fill="none"
            stroke="#2B54F0"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="28" cy="21" r="4" fill="#2B54F0" />
          <circle cx="74" cy="28" r="4" fill="#0F9D6B" />
        </svg>
      )}

      {kind === "gauge" && (
        <div className="relative grid place-items-center">
          <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
            <circle cx="40" cy="40" r="30" fill="none" stroke="#D8E5FC" strokeWidth="6" />
            <circle
              cx="40"
              cy="40"
              r="30"
              fill="none"
              stroke="#0B1A33"
              strokeWidth="6"
              strokeDasharray="188"
              strokeDashoffset="115"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute font-display text-xl font-bold text-ink">23%</span>
        </div>
      )}

      {kind === "split" && (
        <div className="relative flex h-full w-full items-center gap-2 px-1">
          <div className="h-20 flex-1 rounded-2xl bg-[#BDD3F8]" />
          <div className="relative h-20 flex-1 rounded-2xl bg-[#DCE9FF]">
            <span className="absolute bottom-2 right-2 h-7 w-7 rounded-full bg-ink shadow-md" />
          </div>
        </div>
      )}

      {kind === "axis" && (
        <svg viewBox="0 0 90 70" className="relative h-16 w-24">
          <line x1="45" y1="6" x2="45" y2="64" stroke="#0B1A33" strokeWidth="2" />
          <path d="M 22 10 C 36 28, 36 42, 22 60" fill="none" stroke="#7FA6F6" strokeWidth="2" />
          <path d="M 68 10 C 54 28, 54 42, 68 60" fill="none" stroke="#7FA6F6" strokeWidth="2" />
          <circle cx="45" cy="35" r="4.5" fill="#0B1A33" />
        </svg>
      )}

      {kind === "number" && (
        <div className="relative text-center">
          <p className="font-display text-5xl font-semibold leading-none tracking-tight text-ink">
            21
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-cobalt">
            Locked
          </p>
        </div>
      )}

      {kind === "aura" && (
        <div className="relative grid h-20 w-20 place-items-center">
          <div
            className="h-16 w-16 rounded-full blur-[6px]"
            style={{
              background:
                "radial-gradient(circle, rgba(43,84,240,0.85) 0%, rgba(96,165,250,0.55) 55%, transparent 75%)",
            }}
          />
          <span className="absolute font-mono text-[11px] font-bold text-white">SHADOW</span>
        </div>
      )}

      {kind === "dots" && (
        <svg viewBox="0 0 80 80" className="relative h-20 w-20">
          <line x1="22" y1="26" x2="54" y2="20" stroke="#93B4F8" strokeWidth="1.5" />
          <line x1="54" y1="20" x2="60" y2="52" stroke="#93B4F8" strokeWidth="1.5" />
          <line x1="22" y1="26" x2="36" y2="58" stroke="#93B4F8" strokeWidth="1.5" />
          {[
            [22, 26],
            [54, 20],
            [60, 52],
            [36, 58],
            [42, 38],
            [18, 50],
          ].map(([cx, cy], idx) => (
            <circle key={idx} cx={cx} cy={cy} r="3.5" fill="#0B1A33" />
          ))}
        </svg>
      )}
    </div>
  );
}

function BluishOrbitalCarousel() {
  const [selected, setSelected] = useState(0);
  const current = ORBITAL_CARDS[selected];
  const radius = 215;

  return (
    <section
      id="product"
      className="mx-auto max-w-7xl scroll-mt-24 px-6 py-24"
      aria-label="AegisBrain Core Modules"
    >
      <div className="grid items-center gap-14 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Eyebrow>Modular policy architecture</Eyebrow>
          <h2 className="font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-ink md:text-6xl">
            <SplitWords
              text="Eight primitives rotating in lockstep."
              italic={["lockstep."]}
            />
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Every card in the wheel is a deterministic stage inside the gateway. Hover the wheel
            to pause its orbit or click any card to inspect how it governs your agents.
          </p>

          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="mt-8 rounded-[28px] border border-white/95 bg-gradient-to-b from-white via-[#F5F9FF] to-[#E6F0FF] p-6 shadow-[0_30px_65px_-24px_rgba(43,84,240,0.35)]"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-cobalt/10 px-3 py-1 font-mono text-xs font-semibold text-cobalt">
                  {current.tag}
                </span>
                <span className="font-mono text-xs text-muted">
                  0{selected + 1} / 0{ORBITAL_CARDS.length}
                </span>
              </div>
              <h3 className="mt-3 font-display text-2xl font-semibold text-ink">
                {current.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{current.detail}</p>

              <div className="mt-5 flex flex-wrap gap-1.5">
                {ORBITAL_CARDS.map((c, idx) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected(idx)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      selected === idx
                        ? "bg-cobalt text-white shadow-sm"
                        : "bg-white/80 text-muted hover:bg-white hover:text-ink"
                    }`}
                  >
                    {c.tag}
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Auto-Rotating Bluish-White Cards Ring */}
        <div className="relative flex min-h-[540px] items-center justify-center lg:col-span-7">
          {/* Soft ambient bluish halo behind the wheel */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute h-[420px] w-[420px] rounded-full opacity-75 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(43,84,240,0.20) 0%, rgba(191,219,254,0.35) 55%, transparent 75%)",
            }}
          />

          {/* Dashed orbital guide ring */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute h-[430px] w-[430px] rounded-full border border-dashed border-ice"
          />

          {/* Center Core Emblem */}
          <div className="relative z-10 flex h-28 w-28 flex-col items-center justify-center rounded-[28px] border border-white bg-gradient-to-b from-white to-[#EAF2FF] text-center shadow-[0_20px_50px_rgba(43,84,240,0.28)]">
            <Logo size={28} />
            <span className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-cobalt">
              AST Core
            </span>
          </div>

          {/* Rotating Wheel Container */}
          <div className="ab-wheel absolute inset-0 flex items-center justify-center">
            {ORBITAL_CARDS.map((card, idx) => {
              const rad = (card.angle * Math.PI) / 180;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;
              return (
                <div
                  key={card.id}
                  className=" absolute"
                  style={{
                    transform: `translate(${x}px, ${y}px)`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(idx)}
                    aria-label={card.title}
                    className="ab-wheel-item block cursor-pointer focus:outline-none"
                  >
                    <OrbitalCardFace kind={card.kind} active={selected === idx} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 4: StaleRulebook (Scroll-Driven Scan Wipe & 3D Card Flips) */
/* ------------------------------------------------------------------ */

const RULEBOOK_CAPTIONS = [
  "Monday. The handbook says 10%, and every agent follows it.",
  "Tuesday. A manager decides in chat. The handbook and the agents still say 10%.",
  "Seconds later. AegisBrain locks the rule. The handbook and every agent change together.",
];

const FLIP_AGENTS = [
  { name: "Sales bot", t: 0.62 },
  { name: "Support bot", t: 0.67 },
  { name: "Storefront", t: 0.72 },
];

function AgentFlip({
  name,
  t,
  p,
}: {
  name: string;
  t: number;
  p: MotionValue<number>;
}) {
  const rotateX = useTransform(p, [t, t + 0.07], [0, 180]);
  const face = {
    backfaceVisibility: "hidden" as const,
    WebkitBackfaceVisibility: "hidden" as const,
  };
  return (
    <div className="relative h-28" style={{ perspective: 900 }}>
      <motion.div
        className="relative h-full w-full"
        style={{ rotateX, transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-deny/30 bg-gradient-to-b from-white to-[#FDECEF] p-4"
          style={face}
        >
          <p className="text-sm font-medium text-ink">{name}</p>
          <p className="font-display text-3xl font-semibold text-deny">10%</p>
          <p className="text-xs text-deny">Old rule</p>
        </div>
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-allow/30 bg-gradient-to-b from-white to-[#E3F6EC] p-4"
          style={{ ...face, transform: "rotateX(180deg)" }}
        >
          <p className="text-sm font-medium text-ink">{name}</p>
          <p className="font-display text-3xl font-semibold text-allow">5%</p>
          <p className="text-xs text-allow">Current rule</p>
        </div>
      </motion.div>
    </div>
  );
}

function StaleRulebookScene() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });
  const [stage, setStage] = useState(0);

  useMotionValueEvent(p, "change", (v) => setStage(v < 0.14 ? 0 : v < 0.58 ? 1 : 2));

  const bubbleX = useTransform(p, [0.16, 0.34], [160, 0]);
  const bubbleScale = useTransform(p, [0.16, 0.34], [0.7, 1]);
  const bubbleRot = useTransform(p, [0.16, 0.34], [9, 0]);
  const bubbleOp = useTransform(p, [0.16, 0.24], [0, 1]);
  const typing = useTransform(p, [0.1, 0.14, 0.2, 0.24], [0, 1, 1, 0]);
  const wipe = useTransform(p, [0.58, 0.74], ["inset(0 100% 0 0)", "inset(0 0% 0 0)"]);
  const sweepX = useTransform(p, [0.58, 0.74], ["0%", "100%"]);
  const sweepOp = useTransform(p, [0.56, 0.6, 0.74, 0.78], [0, 1, 1, 0]);
  const seal = useSpring(useTransform(p, [0.55, 0.6], [0, 1]), {
    stiffness: 380,
    damping: 18,
  });

  return (
    <div ref={ref} className="relative" style={{ height: "300vh" }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden px-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="h-[3.4rem] overflow-hidden md:h-[4.2rem]" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.p
                key={stage}
                initial={{ y: "105%" }}
                animate={{ y: "0%" }}
                exit={{ y: "-105%" }}
                transition={{ duration: 0.5, ease: EASE }}
                className="font-display text-xl font-semibold leading-tight tracking-tight text-ink md:text-3xl"
              >
                {RULEBOOK_CAPTIONS[stage]}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="mt-6 grid gap-5 md:mt-8 md:grid-cols-2 md:gap-8">
            {/* Company Handbook with Laser Scan Wipe */}
            <div className="relative overflow-hidden rounded-[26px] border border-white/90 bg-white shadow-[0_30px_70px_-26px_rgba(43,84,240,0.35)]">
              <div className="p-6 md:p-8">
                <p className="text-xs uppercase tracking-widest text-muted">
                  Company handbook
                </p>
                <p className="mt-1 font-display text-xl font-semibold text-ink">
                  4. Discounts
                </p>
                <div
                  className="mt-3 rounded-xl p-4"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(transparent 0 27px, #E4ECFA 27px 28px)",
                  }}
                >
                  <p className="text-muted">Agents may offer up to</p>
                  <p className="font-display text-6xl font-semibold leading-none text-deny md:text-7xl">
                    10%
                  </p>
                  <p className="mt-3 text-xs text-muted">Last edited three months ago</p>
                </div>
              </div>

              <motion.div className="absolute inset-0 bg-white" style={{ clipPath: wipe }}>
                <div className="p-6 md:p-8">
                  <p className="text-xs uppercase tracking-widest text-muted">
                    Company handbook
                  </p>
                  <p className="mt-1 font-display text-xl font-semibold text-ink">
                    4. Discounts
                  </p>
                  <div
                    className="mt-3 rounded-xl p-4"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(transparent 0 27px, #E4ECFA 27px 28px)",
                    }}
                  >
                    <p className="text-muted">Agents may offer up to</p>
                    <p className="font-display text-6xl font-semibold leading-none text-allow md:text-7xl">
                      5%
                    </p>
                    <p className="mt-3 text-xs text-allow">
                      Updated just now, with the original message attached
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.span
                aria-hidden="true"
                className="absolute inset-y-0 w-[3px] bg-cobalt shadow-[0_0_28px_6px_rgba(43,84,240,0.55)]"
                style={{ left: sweepX, opacity: sweepOp }}
              />
            </div>

            {/* Chat + Approval Seal */}
            <div className="relative flex flex-col justify-center">
              <p className="mb-3 text-sm text-muted">#policy-updates</p>
              <div className="relative">
                <motion.div
                  className="flex gap-3"
                  style={{
                    x: bubbleX,
                    scale: bubbleScale,
                    rotate: bubbleRot,
                    opacity: bubbleOp,
                    transformOrigin: "100% 50%",
                  }}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-cobalt font-display text-lg font-semibold text-white">
                    P
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Priya <span className="font-normal text-muted">Finance Director</span>
                    </p>
                    <p className="mt-1.5 max-w-sm rounded-2xl rounded-tl-sm border border-white/90 bg-white px-5 py-3.5 text-[17px] leading-relaxed text-ink shadow-[0_18px_40px_-18px_rgba(43,84,240,0.4)]">
                      Margin pressure. From today, discounts are capped at 5%.
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  className="absolute left-14 top-1 flex gap-1.5"
                  style={{ opacity: typing }}
                  aria-hidden="true"
                >
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="h-2 w-2 rounded-full bg-cobalt/60"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.7, repeat: Infinity, delay: d * 0.12 }}
                    />
                  ))}
                </motion.div>
              </div>

              <motion.div
                className="mt-7 inline-flex w-fit items-center gap-2 rounded-full border border-cobalt/30 bg-cobalt/10 px-4 py-2 text-sm font-medium text-cobalt"
                style={{ scale: seal, opacity: seal, transformOrigin: "0% 50%" }}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-cobalt text-[11px] text-white">
                  &#10003;
                </span>
                Rule approved and locked
              </motion.div>

              <p className={`${serif.className} mt-4 max-w-xs text-2xl italic text-muted`}>
                One decision. Everywhere at once.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 md:mt-8 md:gap-6">
            {FLIP_AGENTS.map((a) => (
              <AgentFlip key={a.name} name={a.name} t={a.t} p={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StaleRulebook() {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-24">
        <Eyebrow>The problem</Eyebrow>
        <h2 className="font-display text-4xl font-semibold tracking-tight text-ink">
          Rules change in chat. Agents keep the old rule.
        </h2>
        <p className="mt-5 text-lg text-muted">
          A manager caps discounts at 5% in a message. The handbook and the agents still say 10%.
          AegisBrain turns that message into an approved rule and every agent follows it together.
        </p>
      </section>
    );
  }
  return (
    <section aria-label="How a decision in chat reaches every agent">
      <div className="mx-auto max-w-7xl px-6 pt-24">
        <Eyebrow>The problem</Eyebrow>
        <h2 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-ink md:text-6xl">
          Rules change in chat.{" "}
          <span className={`${serif.className} italic text-cobalt`}>Agents do not.</span>
        </h2>
        <p className="mt-5 text-muted">Scroll to watch one decision travel.</p>
      </div>
      <StaleRulebookScene />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 5: Pipeline (Scroll-Drawn Curved SVG Circuit & Packet)     */
/* ------------------------------------------------------------------ */

const PIPELINE_NODES = [
  { x: 80, y: 240, title: "A manager decides", body: "In a channel your company chose." },
  {
    x: 330,
    y: 130,
    title: "Authority check",
    body: "Only the right roles can propose a rule.",
  },
  { x: 600, y: 290, title: "AI drafts it", body: "A draft, never a live rule." },
  {
    x: 870,
    y: 130,
    title: "A person approves",
    body: "The original message sits beside the rule.",
  },
  {
    x: 1120,
    y: 240,
    title: "Gateway enforces",
    body: "Plain code checks every action.",
  },
];

const PIPELINE_PATH =
  "M80,240 C200,240 210,130 330,130 S470,290 600,290 S740,130 870,130 S1000,240 1120,240";
const PW = 1200;
const PH = 420;

function PipelineStop({ i, prog }: { i: number; prog: MotionValue<number> }) {
  const n = PIPELINE_NODES[i];
  const a = i / (PIPELINE_NODES.length - 1);
  const above = i % 2 === 1;
  const on = useTransform(prog, [Math.max(0, a - 0.05), Math.min(1, a + 0.01)], [0, 1]);
  const cardY = useTransform(on, [0, 1], [above ? -30 : 30, 0]);
  const cardScale = useTransform(on, [0, 1], [0.88, 1]);
  const cardRot = useTransform(on, [0, 1], [above ? -4 : 4, 0]);
  const cardOp = useTransform(on, [0, 1], [0.3, 1]);
  const dotScale = useTransform(on, [0, 1], [0.6, 1]);

  return (
    <div
      className="absolute"
      style={{
        left: `${(n.x / PW) * 100}%`,
        top: `${(n.y / PH) * 100}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <motion.span
        className="relative block h-6 w-6 rounded-full border-4 border-white bg-cobalt shadow-[0_8px_20px_-4px_rgba(43,84,240,0.6)]"
        style={{ scale: dotScale }}
      />
      <motion.div
        className="absolute left-1/2 w-52 -translate-x-1/2"
        style={{
          y: cardY,
          scale: cardScale,
          rotate: cardRot,
          opacity: cardOp,
          ...(above ? { bottom: "2rem" } : { top: "2rem" }),
        }}
      >
        <div className="rounded-2xl border border-white/90 bg-white/90 p-4 text-center shadow-[0_24px_50px_-22px_rgba(43,84,240,0.4)] backdrop-blur-md">
          <p className="text-xs font-semibold text-cobalt">Step {i + 1}</p>
          <p className="mt-0.5 font-display text-lg font-semibold leading-tight tracking-tight text-ink">
            {n.title}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted">{n.body}</p>
        </div>
      </motion.div>
    </div>
  );
}

function PipelineCircuit() {
  const wrap = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const { scrollYProgress } = useScroll({
    target: wrap,
    offset: ["start 70%", "end 45%"],
  });
  const prog = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.5 });

  const point = (v: number) => {
    const el = pathRef.current;
    if (!el) return { x: PIPELINE_NODES[0].x, y: PIPELINE_NODES[0].y };
    const len = el.getTotalLength();
    return el.getPointAtLength(Math.max(0, Math.min(1, v)) * len);
  };

  const cx = useTransform(prog, (v) => point(v).x);
  const cy = useTransform(prog, (v) => point(v).y);

  return (
    <div
      ref={wrap}
      className="relative mx-auto hidden w-full max-w-[1200px] lg:block"
      style={{ aspectRatio: `${PW}/${PH}` }}
    >
      <svg
        viewBox={`0 0 ${PW} ${PH}`}
        className="absolute inset-0 h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        <path
          ref={pathRef}
          d={PIPELINE_PATH}
          stroke="#D3E1FB"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="2 12"
        />
        <motion.path
          d={PIPELINE_PATH}
          stroke="#2B54F0"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ pathLength: prog }}
        />
        <motion.circle r="16" fill="#2B54F0" fillOpacity="0.18" style={{ cx, cy }} />
        <motion.circle
          r="7"
          fill="#2B54F0"
          stroke="#fff"
          strokeWidth="3"
          style={{ cx, cy }}
        />
      </svg>
      {PIPELINE_NODES.map((_, i) => (
        <PipelineStop key={i} i={i} prog={prog} />
      ))}
    </div>
  );
}

function Pipeline() {
  const reduce = useReducedMotion();
  return (
    <section
      id="how"
      className="mx-auto max-w-7xl scroll-mt-24 px-6 py-28"
      aria-label="How a message becomes a checked action"
    >
      <Eyebrow>How it works</Eyebrow>
      <h2 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-ink md:text-6xl">
        <SplitWords text="From a message to a checked action" italic={["checked"]} />
      </h2>
      <p className="mt-5 max-w-xl text-lg text-muted">
        Five steps. Nothing becomes a rule until a person approves it, and no AI decides whether
        an agent&apos;s action is allowed.
      </p>

      <div className="mt-16">
        {reduce ? (
          <ol className="grid gap-4 lg:grid-cols-5">
            {PIPELINE_NODES.map((n, i) => (
              <li
                key={n.title}
                className="rounded-2xl border border-white/90 bg-white/90 p-4"
              >
                <p className="text-xs font-semibold text-cobalt">Step {i + 1}</p>
                <p className="font-display text-lg font-semibold text-ink">{n.title}</p>
                <p className="text-sm text-muted">{n.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <PipelineCircuit />
            <ol className="space-y-4 lg:hidden">
              {PIPELINE_NODES.map((n, i) => (
                <motion.li
                  key={n.title}
                  initial={{ x: i % 2 ? 60 : -60, rotate: i % 2 ? 3 : -3, opacity: 0 }}
                  whileInView={{ x: 0, rotate: 0, opacity: 1 }}
                  viewport={{ once: true, margin: "-10%" }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                  className="rounded-2xl border border-white/90 bg-white/90 p-5 shadow-[0_24px_50px_-26px_rgba(43,84,240,0.4)]"
                >
                  <p className="text-xs font-semibold text-cobalt">Step {i + 1}</p>
                  <p className="font-display text-xl font-semibold tracking-tight text-ink">
                    {n.title}
                  </p>
                  <p className="mt-1 text-muted">{n.body}</p>
                </motion.li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 6: Anatomy of a Decision Record                            */
/* ------------------------------------------------------------------ */

const ANATOMY_PARTS = [
  {
    id: "decision",
    n: 1,
    label: "Decision",
    value: "Blocked",
    title: "One of three answers",
    body: "Every agent action gets one answer: allowed, blocked, or held for a person. A held action waits until someone decides.",
  },
  {
    id: "rule",
    n: 2,
    label: "Rule",
    value: "promo_cap_v2",
    title: "Which rule decided",
    body: "The exact rule that decided this action, so nobody has to guess later.",
  },
  {
    id: "version",
    n: 3,
    label: "Version",
    value: "Version 2",
    title: "Which version of the rule",
    body: "Rules change. The record keeps the version that was in force at that moment.",
  },
  {
    id: "approver",
    n: 4,
    label: "Approved by",
    value: "Finance director, 09:41",
    title: "Who locked the rule",
    body: "A person with the right authority approved it. Their role and the time are kept with the rule.",
  },
  {
    id: "record",
    n: 5,
    label: "Record",
    value: "9f3a…c71e",
    title: "A fingerprint",
    body: "Each decision carries a fingerprint linked to the one before it. If a record is edited later, the chain no longer matches.",
  },
];

function Anatomy() {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched) return;
    const id = setInterval(() => setActive((a) => (a + 1) % ANATOMY_PARTS.length), 3600);
    return () => clearInterval(id);
  }, [touched]);

  const pick = (i: number) => {
    setTouched(true);
    setActive(i);
  };

  const cur = ANATOMY_PARTS[active];

  return (
    <section
      className="mx-auto max-w-7xl px-6 py-28"
      aria-label="Anatomy of a decision record"
    >
      <Eyebrow>Proof for every decision</Eyebrow>
      <h2 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-ink md:text-6xl">
        <SplitWords text="Every answer leaves a record" italic={["record"]} />
      </h2>

      <div className="mt-14 grid items-center gap-10 lg:grid-cols-12">
        <motion.div
          className="lg:col-span-7"
          initial={{ opacity: 0, y: 60, rotateX: 16 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 1.1, ease: EASE }}
          style={{ transformPerspective: 1200 }}
        >
          <div
            className="rounded-[30px] border border-white/90 bg-gradient-to-b from-white to-[#EAF1FF] p-6 md:p-8"
            style={{
              boxShadow:
                "0 50px 90px -30px rgba(43,84,240,0.4), 0 12px 30px rgba(11,26,51,0.08)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ice pb-4">
              <div>
                <p className="font-mono text-[13px] text-cobalt">sales_bot_3</p>
                <p className="font-mono text-lg font-semibold text-ink">discounts.apply</p>
                <p className="text-sm text-muted">10% off, regular customer</p>
              </div>
              <span className="rounded-full border border-ice bg-white px-3 py-1 text-xs text-muted">
                Example record
              </span>
            </div>

            <ul className="mt-3">
              {ANATOMY_PARTS.map((p, i) => (
                <li key={p.id} className="relative">
                  {active === i && (
                    <motion.span
                      layoutId="anatomy-highlight"
                      className="absolute inset-0 rounded-2xl border border-cobalt/40 bg-cobalt/[0.07]"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    aria-pressed={active === i}
                    className="relative flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left"
                  >
                    <span className="relative grid h-8 w-8 shrink-0 place-items-center">
                      {active === i && (
                        <span
                          className="ab-ring absolute inset-0 rounded-full bg-cobalt/40"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={`relative grid h-8 w-8 place-items-center rounded-full text-sm font-semibold transition-colors duration-300 ${
                          active === i
                            ? "bg-cobalt text-white"
                            : "border border-ice bg-white text-muted"
                        }`}
                      >
                        {p.n}
                      </span>
                    </span>
                    <span className="w-28 shrink-0 text-sm text-muted">{p.label}</span>
                    <span
                      className={`min-w-0 flex-1 truncate font-mono text-[15px] ${
                        p.id === "decision" ? "font-semibold text-deny" : "text-ink"
                      }`}
                    >
                      {p.value}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        <div className="lg:col-span-5">
          <div className="overflow-hidden" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={cur.id}
                initial={{ x: 50, rotate: 1.5, opacity: 0 }}
                animate={{ x: 0, rotate: 0, opacity: 1 }}
                exit={{ x: -50, rotate: -1.5, opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <p className="text-sm font-semibold text-cobalt">
                  {cur.n} of {ANATOMY_PARTS.length}
                </p>
                <h3 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
                  {cur.title}
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-muted">{cur.body}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-8 flex gap-2" aria-hidden="true">
            {ANATOMY_PARTS.map((p, i) => (
              <span
                key={p.id}
                className="relative h-1 flex-1 overflow-hidden rounded-full bg-ice"
              >
                {active === i && !touched && (
                  <motion.span
                    key={`${i}-${touched}`}
                    className="absolute inset-0 origin-left bg-cobalt"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 3.6, ease: "linear" }}
                  />
                )}
                {(touched ? active === i : i < active) && (
                  <span className="absolute inset-0 bg-cobalt" />
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 7: DayScrubber ("One decision, two very different mornings")*/
/* ------------------------------------------------------------------ */

const NIGHT_MOMENTS = [
  {
    time: "2:00 AM",
    label: "The CEO posts",
    without: "The CEO posts in chat: match the competitor, 20% off until 8 AM.",
    with: "The CEO posts in chat: match the competitor, 20% off until 8 AM.",
  },
  {
    time: "2:01 AM",
    label: "The rule spreads",
    without: "Someone must update every agent by hand. Most still run the old rule.",
    with: "A manager approves one card. Every agent and the storefront follow 20%.",
  },
  {
    time: "8:00 AM",
    label: "The sale ends",
    without: "The sale is over, but two agents still offer 20%.",
    with: "The rule expires by itself. Everything is back to the normal 5%.",
  },
  {
    time: "Monday",
    label: "The review",
    without: "Nobody can say which rule applied, or who allowed it.",
    with: "The log shows the rule, its version and who approved it.",
  },
];

function getNightStates(m: number, withLayer: boolean): number[] {
  const n = 12;
  if (m === 0) return Array(n).fill(0);
  if (m === 1) {
    return withLayer
      ? Array(n).fill(1)
      : Array.from({ length: n }, (_, i) => (i < 3 ? 1 : 2));
  }
  if (m === 2) {
    return withLayer
      ? Array(n).fill(0)
      : Array.from({ length: n }, (_, i) => (i === 4 || i === 9 ? 2 : 0));
  }
  return Array(n).fill(0);
}

const DOT_COLORS = ["#C9D7F2", "#0F9D6B", "#D42B4D"];

function NightDots({ m, withLayer }: { m: number; withLayer: boolean }) {
  const s = getNightStates(m, withLayer);
  return (
    <div className="grid grid-cols-6 gap-3 md:gap-4">
      {s.map((st, i) => (
        <motion.span
          key={`${i}-${st}-${m}`}
          className="aspect-square rounded-full"
          style={{ backgroundColor: DOT_COLORS[st] }}
          initial={{ scale: 0.4 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 15, delay: i * 0.035 }}
        />
      ))}
    </div>
  );
}

function NightPanel({ m, withLayer }: { m: number; withLayer: boolean }) {
  const text = withLayer ? NIGHT_MOMENTS[m].with : NIGHT_MOMENTS[m].without;
  const s = getNightStates(m, withLayer);
  const stale = s.filter((x) => x === 2).length;
  const ok = s.filter((x) => x === 1).length;

  return (
    <div
      className={`rounded-[28px] border p-6 md:p-8 ${
        withLayer
          ? "border-allow/30 bg-gradient-to-b from-white to-[#E8F7EF]"
          : "border-deny/25 bg-gradient-to-b from-white to-[#FDEEF1]"
      }`}
      style={{ boxShadow: "0 40px 80px -36px rgba(43,84,240,0.32)" }}
    >
      <p className={`text-sm font-semibold ${withLayer ? "text-allow" : "text-deny"}`}>
        {withLayer ? "With AegisBrain" : "Without a rule layer"}
      </p>
      <div className="mt-3 h-[8.2rem] overflow-hidden md:h-[6.6rem]">
        <AnimatePresence mode="wait">
          <motion.p
            key={m}
            initial={{ y: 40, rotateX: -30, opacity: 0 }}
            animate={{ y: 0, rotateX: 0, opacity: 1 }}
            exit={{ y: -30, rotateX: 30, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            style={{ transformPerspective: 700 }}
            className="font-display text-xl font-semibold leading-snug tracking-tight text-ink md:text-2xl"
          >
            {text}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-6">
        <NightDots m={m} withLayer={withLayer} />
      </div>
      <p className="mt-5 min-h-[1.5rem] text-sm text-muted">
        {m === 3
          ? withLayer
            ? "Rule, version, approver: all on record."
            : "No record to check."
          : `${ok} following the new rule${stale ? `, ${stale} on an old one` : ""}`}
      </p>
    </div>
  );
}

function DayScrubber() {
  const track = useRef<HTMLDivElement>(null);
  const t = useMotionValue(0);
  const [m, setM] = useState(0);
  const [touched, setTouched] = useState(false);
  const left = useTransform(t, [0, 3], ["0%", "100%"]);
  const fill = useTransform(t, [0, 3], [0, 1]);

  useMotionValueEvent(t, "change", (v) =>
    setM(Math.max(0, Math.min(3, Math.round(v))))
  );

  useEffect(() => {
    if (touched) return;
    const id = setInterval(() => {
      const next = (Math.round(t.get()) + 1) % 4;
      animate(t, next, { type: "spring", stiffness: 120, damping: 20 });
    }, 3400);
    return () => clearInterval(id);
  }, [touched, t]);

  const fromX = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 3;
  };

  return (
    <section
      className="mx-auto max-w-7xl px-6 py-28"
      aria-label="One night, with and without AegisBrain"
    >
      <Eyebrow>An example night</Eyebrow>
      <h2 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-ink md:text-6xl">
        <SplitWords
          text="One decision, two very different mornings"
          italic={["mornings"]}
        />
      </h2>
      <p className="mt-5 max-w-xl text-lg text-muted">
        Each dot is an agent. Green follows the new rule, red is on an old one. Drag the handle
        through the night.
      </p>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <NightPanel m={m} withLayer={false} />
        <NightPanel m={m} withLayer />
      </div>

      <div className="mx-auto mt-12 max-w-3xl">
        <div
          ref={track}
          className="relative h-12 touch-none select-none"
          onPointerDown={(e) => {
            setTouched(true);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            t.set(fromX(e.clientX));
          }}
          onPointerMove={(e) => {
            if (e.buttons === 0) return;
            t.set(fromX(e.clientX));
          }}
          onPointerUp={() =>
            animate(t, Math.round(t.get()), {
              type: "spring",
              stiffness: 260,
              damping: 24,
            })
          }
        >
          <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ice" />
          <motion.div
            className="absolute left-0 right-0 top-1/2 h-1.5 origin-left -translate-y-1/2 rounded-full bg-cobalt"
            style={{ scaleX: fill }}
          />
          {NIGHT_MOMENTS.map((mo, i) => (
            <button
              key={mo.time}
              type="button"
              onClick={() => {
                setTouched(true);
                animate(t, i, { type: "spring", stiffness: 200, damping: 22 });
              }}
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ice"
              style={{ left: `${(i / 3) * 100}%` }}
              aria-label={`Go to ${mo.time}`}
            />
          ))}
          <motion.div
            role="slider"
            tabIndex={0}
            aria-label="Time of night"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={m}
            aria-valuetext={NIGHT_MOMENTS[m].time}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                animate(t, Math.min(3, m + 1), {
                  type: "spring",
                  stiffness: 200,
                  damping: 22,
                });
              }
              if (e.key === "ArrowLeft") {
                animate(t, Math.max(0, m - 1), {
                  type: "spring",
                  stiffness: 200,
                  damping: 22,
                });
              }
              setTouched(true);
            }}
            className="absolute top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-full border-4 border-white bg-cobalt shadow-[0_12px_28px_-6px_rgba(43,84,240,0.7)] active:cursor-grabbing"
            style={{ left }}
            whileTap={{ scale: 1.15 }}
          >
            <span className="h-2 w-2 rounded-full bg-white" />
          </motion.div>
        </div>

        <div className="mt-3 grid grid-cols-4 text-center text-sm">
          {NIGHT_MOMENTS.map((mo, i) => (
            <span
              key={mo.time}
              className={`transition-colors duration-300 ${
                i === m ? "font-semibold text-ink" : "text-muted"
              }`}
            >
              {mo.time}
              <span className="block text-xs font-normal">{mo.label}</span>
            </span>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Illustration of an example night. Not live data.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 8: Interactive Gateway Playground (Connected to FastAPI)   */
/* ------------------------------------------------------------------ */

function Playground({
  rules,
  onResult,
}: {
  rules: Rule[];
  onResult: (d: Decision) => void;
}) {
  const [selected, setSelected] = useState(SCENARIOS[0].id);
  const [running, setRunning] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const scenario = SCENARIOS.find((s) => s.id === selected) ?? SCENARIOS[0];

  const run = async () => {
    setRunning(true);
    setDecision(null);
    const result = await evaluateGateway(scenario.call, rules);
    setTimeout(() => {
      setDecision(result);
      setRunning(false);
      onResult(result);
    }, 200);
  };

  const ui = decision ? VERDICT_UPPER_UI[decision.verdict] : null;

  return (
    <section id="try" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-24">
      <Eyebrow>Interactive gateway</Eyebrow>
      <h2 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-ink md:text-6xl">
        <SplitWords text="Test an agent action right now" italic={["now"]} />
      </h2>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Pick something an agent might do. The gateway checks it against your active policies and
        auto-corrects outdated requests in milliseconds.
      </p>

      <div className="mt-12 grid gap-8 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-5">
          <div role="radiogroup" aria-label="Agent action" className="space-y-2.5">
            {SCENARIOS.map((s) => {
              const active = s.id === selected;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSelected(s.id);
                    setDecision(null);
                  }}
                  className={`group flex w-full items-start justify-between gap-4 rounded-2xl border p-4 text-left transition-all duration-200 ${
                    active
                      ? "border-cobalt bg-white shadow-[0_12px_30px_rgba(43,84,240,0.14)] -translate-y-0.5"
                      : "border-white/80 bg-white/75 hover:border-cobalt/30 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <span
                      className={`mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 transition-all ${
                        active
                          ? "border-cobalt bg-cobalt shadow-[0_0_10px_rgba(43,84,240,0.5)]"
                          : "border-ice bg-white"
                      }`}
                    />
                    <span>
                      <span className="block font-display text-base font-semibold text-ink">
                        {s.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {s.who} · {s.note}
                      </span>
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full bg-mist px-2.5 py-0.5 text-[10px] font-semibold text-cobalt">
                    {s.badge}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-cobalt">
            Agent Action Payload
          </p>
          <pre className="overflow-x-auto rounded-2xl border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-4 font-mono text-[12px] leading-relaxed text-ink shadow-sm">
            {JSON.stringify(scenario.call, null, 2)}
          </pre>

          <Magnetic className="w-full" strength={0.2}>
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cobalt px-6 py-4 font-semibold text-white shadow-lg shadow-cobalt/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            >
              {running ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Evaluating Policy...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" /> Check this action
                </>
              )}
            </button>
          </Magnetic>
        </div>

        <div className="lg:col-span-7">
          <div
            className="flex min-h-[500px] flex-col rounded-[32px] border border-white/90 bg-gradient-to-b from-white/95 to-[#EAF1FF]/95 p-6 md:p-8"
            style={{
              boxShadow:
                "0 40px 80px -28px rgba(43,84,240,0.32), 0 10px 26px rgba(11,26,51,0.06)",
            }}
          >
            <AnimatePresence mode="wait">
              {decision && ui ? (
                <motion.div
                  key={decision.at}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="flex flex-1 flex-col"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className={`flex items-center gap-3 ${ui.text}`}>
                      {decision.verdict === "DENY" && <Lock className="h-7 w-7" />}
                      {decision.verdict === "HOLD" && <AlertTriangle className="h-7 w-7" />}
                      {decision.verdict === "ALLOW" && <CheckCircle2 className="h-7 w-7" />}
                      <p className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                        {ui.label}
                      </p>
                    </div>
                    <span className="rounded-full border border-cobalt/20 bg-white px-3.5 py-1 font-mono text-xs font-semibold text-cobalt shadow-sm">
                      {decision.ms.toFixed(2)} ms · {decision.via}
                    </span>
                  </div>

                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink md:text-base">
                    {decision.correctionNote ?? decision.reason}
                  </p>

                  {decision.correctedParams && (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-deny/25 bg-white p-3.5">
                        <p className="text-[11px] font-semibold uppercase text-deny">
                          × Agent Requested (Outdated)
                        </p>
                        <pre className="mt-1 font-mono text-xs text-ink">
                          {JSON.stringify(decision.params, null, 2)}
                        </pre>
                      </div>
                      <div className="rounded-2xl border border-allow/30 bg-white p-3.5">
                        <p className="text-[11px] font-semibold uppercase text-allow">
                          ✓ Auto-Corrected by Gateway
                        </p>
                        <pre className="mt-1 font-mono text-xs text-ink">
                          {JSON.stringify(decision.correctedParams, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  <div className="mt-auto pt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cobalt">
                      Verified Decision Record
                    </p>
                    <pre className="overflow-x-auto rounded-2xl border border-ice bg-white/95 p-4 font-mono text-[12px] leading-relaxed text-ink shadow-inner">
                      {JSON.stringify(
                        {
                          request_id: decision.requestId,
                          agent: scenario.call.agent,
                          action: scenario.call.action,
                          verdict: decision.verdict,
                          rule: decision.ruleId ?? "default_allow",
                          checked_in_ms: Number(decision.ms.toFixed(2)),
                          sha256: decision.auditHash.slice(0, 24),
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-1 flex-col items-center justify-center text-center"
                >
                  <div className="grid h-16 w-16 place-items-center rounded-2xl border border-ice bg-mist text-cobalt shadow-sm">
                    <Fingerprint className="h-8 w-8" />
                  </div>
                  <p className="mt-5 font-display text-2xl font-semibold text-ink">
                    Gateway Ready for Inspection
                  </p>
                  <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
                    Choose an agent scenario on the left, then click{" "}
                    <strong className="text-ink">Check this action</strong>.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 9: Principles + Looping SVG Icons + Strike-Through Limits  */
/* ------------------------------------------------------------------ */

function DraftIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" fill="none" aria-hidden="true">
      <rect
        x="10"
        y="8"
        width="44"
        height="48"
        rx="10"
        stroke="#2B54F0"
        strokeWidth="3"
      />
      {[24, 34, 44].map((y, i) => (
        <motion.path
          key={y}
          d={`M20 ${y} H${i === 2 ? 36 : 44}`}
          stroke="#2B54F0"
          strokeWidth="3.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 1, 0] }}
          transition={{
            duration: 3.4,
            repeat: Infinity,
            delay: i * 0.45,
            times: [0, 0.3, 0.8, 1],
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  );
}

function ApproveIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="24" stroke="#D3E1FB" strokeWidth="3" />
      <motion.circle
        cx="32"
        cy="32"
        r="24"
        stroke="#2B54F0"
        strokeWidth="3"
        strokeLinecap="round"
        style={{ rotate: -90, originX: "50%", originY: "50%" }}
        animate={{ pathLength: [0, 1, 1, 0] }}
        transition={{
          duration: 3.4,
          repeat: Infinity,
          times: [0, 0.4, 0.85, 1],
          ease: "easeInOut",
        }}
      />
      <motion.path
        d="M21 33 L29 41 L44 24"
        stroke="#0F9D6B"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ pathLength: [0, 0, 1, 1, 0] }}
        transition={{
          duration: 3.4,
          repeat: Infinity,
          times: [0, 0.3, 0.5, 0.85, 1],
          ease: "easeInOut",
        }}
      />
    </svg>
  );
}

function EnforceIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" fill="none" aria-hidden="true">
      <path
        d="M32 6 L54 14 V32 C54 45 45 54 32 58 C19 54 10 45 10 32 V14 Z"
        stroke="#2B54F0"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <motion.path
        d="M18 0 H46"
        stroke="#2B54F0"
        strokeWidth="3"
        strokeLinecap="round"
        animate={{ y: [14, 52, 14], opacity: [0, 1, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

const PRINCIPLE_CARDS = [
  {
    icon: <DraftIcon />,
    title: "AI drafts",
    body: "It reads the message and proposes a rule. A draft is all it can ever make. Unclear message? It asks a question.",
  },
  {
    icon: <ApproveIcon />,
    title: "People approve",
    body: "A person with the right authority reads the original message beside the rule, then locks it, edits it or ignores it.",
  },
  {
    icon: <EnforceIcon />,
    title: "Code enforces",
    body: "Plain code checks every agent action against the locked rules. No AI is in that path, so the same request always gets the same answer.",
  },
];

function SpotCard({ i, children }: { i: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 180, damping: 18 });
  const sry = useSpring(ry, { stiffness: 180, damping: 18 });

  return (
    <motion.div
      initial={{ x: (1 - i) * 140, y: 60, rotate: (i - 1) * 9, scale: 0.9, opacity: 0 }}
      whileInView={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ type: "spring", stiffness: 90, damping: 16, delay: i * 0.12 }}
      style={{ perspective: 900 }}
    >
      <motion.div
        ref={ref}
        className="group relative h-full overflow-hidden rounded-[28px] border border-white/90 bg-gradient-to-b from-white to-[#EDF3FF] p-7"
        style={{
          rotateX: srx,
          rotateY: sry,
          transformStyle: "preserve-3d",
          boxShadow:
            "0 40px 80px -34px rgba(43,84,240,0.4), 0 10px 26px rgba(11,26,51,0.07)",
        }}
        onPointerMove={(e) => {
          if (reduce || !ref.current) return;
          const r = ref.current.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          ry.set((px - 0.5) * 12);
          rx.set((py - 0.5) * -10);
          ref.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
          ref.current.style.setProperty("--my", `${e.clientY - r.top}px`);
        }}
        onPointerLeave={() => {
          rx.set(0);
          ry.set(0);
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgba(43,84,240,0.16), transparent 65%)",
          }}
        />
        <div className="relative" style={{ transform: "translateZ(30px)" }}>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

const HONEST_LIMITS = [
  ["Read private messages", "Only the channels your administrator connects."],
  ["Let AI approve a rule", "A person with authority locks every rule."],
  ["Put AI in the enforcement path", "Plain code decides, the same way every time."],
  ["Claim certifications we do not have", "No independent audit yet. We say so."],
];

function Principles() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-28" aria-label="Principles">
      <Eyebrow>Three ideas</Eyebrow>
      <h2 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-ink md:text-6xl">
        <SplitWords text="AI writes. People decide. Code enforces." italic={["decide."]} />
      </h2>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {PRINCIPLE_CARDS.map((c, i) => (
          <SpotCard key={c.title} i={i}>
            {c.icon}
            <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink">
              {c.title}
            </h3>
            <p className="mt-2 leading-relaxed text-muted">{c.body}</p>
          </SpotCard>
        ))}
      </div>

      <div className="mt-24 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Eyebrow>Straight talk</Eyebrow>
          <h3 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
            What we do not do
          </h3>
        </div>
        <ul className="divide-y divide-ice border-y border-ice lg:col-span-8">
          {HONEST_LIMITS.map(([no, yes], i) => (
            <motion.li
              key={no}
              className="grid gap-2 py-6 md:grid-cols-2 md:gap-8"
              initial="hidden"
              whileInView="shown"
              viewport={{ once: true, margin: "-12%" }}
              transition={{ delayChildren: i * 0.08 }}
            >
              <p className="relative w-fit font-display text-xl font-semibold tracking-tight text-muted">
                {no}
                <motion.span
                  className="absolute left-0 top-1/2 h-[2px] w-full origin-left bg-deny"
                  variants={{ hidden: { scaleX: 0 }, shown: { scaleX: 1 } }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.5 + i * 0.08 }}
                />
              </p>
              <motion.p
                className="text-lg text-ink"
                variants={{
                  hidden: { x: 24, opacity: 0 },
                  shown: { x: 0, opacity: 1 },
                }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.9 + i * 0.08 }}
              >
                {yes}
              </motion.p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Section 10: Editorial FAQ + FinalCta                               */
/* ------------------------------------------------------------------ */

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  const items = (
    faqs as Array<{ q?: string; question?: string; a?: string; answer?: string }>
  ).slice(0, 7);

  return (
    <section
      id="faq"
      className="mx-auto max-w-7xl scroll-mt-24 px-6 py-28"
      aria-label="Questions"
    >
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Eyebrow>Questions</Eyebrow>
          <h2 className="font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-ink md:text-5xl">
            <SplitWords text="Plain answers" italic={["answers"]} />
          </h2>
          <a
            href="#contact"
            className="mt-6 inline-block font-medium text-cobalt underline underline-offset-4"
          >
            Ask us directly
          </a>
        </div>

        <ul className="lg:col-span-8">
          {items.map((f, i) => {
            const isOpen = open === i;
            const qText = f.q ?? f.question ?? "";
            const aText = f.a ?? f.answer ?? "";
            return (
              <motion.li
                key={i}
                layout
                initial={{ x: 40, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                viewport={{ once: true, margin: "-8%" }}
                transition={{ duration: 0.7, ease: EASE, delay: i * 0.05 }}
                className="relative border-b border-ice"
              >
                {isOpen && (
                  <motion.span
                    layoutId="faq-bar"
                    className="absolute bottom-0 left-0 top-0 w-[3px] rounded-full bg-cobalt"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-5 py-6 pl-5 pr-2 text-left"
                >
                  <span
                    className={`font-mono text-sm transition-colors ${
                      isOpen ? "text-cobalt" : "text-muted"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 font-display text-xl font-semibold tracking-tight text-ink md:text-2xl">
                    {qText}
                  </span>
                  <motion.span
                    className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-ice bg-white/80 text-lg leading-none"
                    animate={{
                      rotate: isOpen ? 135 : 0,
                      backgroundColor: isOpen ? "#2B54F0" : "rgba(255,255,255,0.8)",
                      color: isOpen ? "#fff" : "#0B1A33",
                    }}
                    transition={{ type: "spring", stiffness: 380, damping: 24 }}
                    aria-hidden="true"
                  >
                    +
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.5, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <motion.p
                        initial={{ y: 20, rotateX: -12 }}
                        animate={{ y: 0, rotateX: 0 }}
                        transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
                        style={{ transformPerspective: 700 }}
                        className="max-w-2xl pb-7 pl-14 pr-6 text-lg leading-relaxed text-muted"
                      >
                        {aText}
                      </motion.p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const CTA_BITS = [
  { l: "8%", t: "20%", s: 10, d: 0 },
  { l: "22%", t: "74%", s: 16, d: 1.2 },
  { l: "46%", t: "12%", s: 8, d: 2.1 },
  { l: "68%", t: "80%", s: 12, d: 0.6 },
  { l: "86%", t: "26%", s: 18, d: 1.7 },
  { l: "93%", t: "68%", s: 9, d: 2.6 },
];

function FinalCta({ onOpenPortal }: { onOpenPortal: () => void }) {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20 pt-12">
      <motion.div
        className="relative overflow-hidden rounded-[40px] border border-white/90 bg-gradient-to-br from-white via-[#EAF1FF] to-[#CFE0FF] px-8 py-20 md:px-16 md:py-28"
        style={{ boxShadow: "0 70px 120px -50px rgba(43,84,240,0.55)" }}
        initial={{ clipPath: "inset(18% 12% 18% 12% round 60px)", scale: 0.96 }}
        whileInView={{ clipPath: "inset(0% 0% 0% 0% round 40px)", scale: 1 }}
        viewport={{ once: true, margin: "-12%" }}
        transition={{ duration: 1.3, ease: EASE }}
      >
        <div
          aria-hidden="true"
          className="ab-conic pointer-events-none absolute -right-1/4 -top-1/2 h-[140%] w-[70%] rounded-full opacity-60"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(43,84,240,0.0), rgba(43,84,240,0.28), rgba(125,160,255,0.0), rgba(43,84,240,0.2), rgba(43,84,240,0.0))",
          }}
        />
        {CTA_BITS.map((b, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="ab-float pointer-events-none absolute rounded-full bg-white/80 shadow-[0_0_30px_rgba(43,84,240,0.35)]"
            style={{
              left: b.l,
              top: b.t,
              width: b.s,
              height: b.s,
              animationDelay: `${b.d}s`,
            }}
          />
        ))}
        <div className="relative max-w-3xl">
          <h2 className="font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-ink md:text-6xl">
            <SplitWords
              text="Start with a pilot that blocks nothing and shows what we would have stopped."
              italic={["nothing"]}
            />
          </h2>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Two weeks in shadow mode. A clear report at the end. You decide what happens next.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-7">
            <Magnetic strength={0.35}>
              <button
                type="button"
                onClick={onOpenPortal}
                className="ab-shine-wrap relative inline-block overflow-hidden rounded-full bg-ink px-8 py-4 font-medium text-paper shadow-[0_20px_44px_-14px_rgba(11,26,51,0.7)]"
              >
                <span
                  className="ab-shine absolute inset-y-0 left-0 w-1/3 bg-white/25"
                  aria-hidden="true"
                />
                <span className="relative">Open Manager Verification Portal</span>
              </button>
            </Magnetic>
            <a href="#contact" className="group relative font-medium text-ink">
              Register organization below
              <span className="absolute -bottom-1.5 left-0 h-[2px] w-full origin-left scale-x-[0.25] bg-cobalt transition-transform duration-500 group-hover:scale-x-100" />
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Unfolding Portal Curtain & Fast GateIntro                          */
/* ------------------------------------------------------------------ */

function UnfoldingCurtain({
  active,
  title,
  subtitle,
}: {
  active: boolean;
  title: string;
  subtitle: string;
}) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="unfold-curtain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden"
        >
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "-102%" }}
            transition={{ duration: 0.6, ease: EASE_DRAMATIC }}
            className="blueprint absolute inset-x-0 top-0 h-1/2 border-b border-cobalt/20 bg-gradient-to-b from-white to-[#EAF2FF]"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "102%" }}
            transition={{ duration: 0.6, ease: EASE_DRAMATIC }}
            className="blueprint absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-white to-[#EAF2FF]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.04, y: -16 }}
            transition={{ duration: 0.38, delay: 0.12, ease: EASE }}
            className="relative z-10 max-w-lg rounded-3xl border border-ice bg-white/95 px-8 py-7 text-center shadow-[0_24px_60px_rgba(43,84,240,0.22)]"
          >
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-cobalt/20 bg-white shadow-lg shadow-cobalt/15">
              <Logo size={28} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cobalt">
              {subtitle}
            </p>
            <h3 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              {title}
            </h3>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 1: Manager Authentication Portal (Real OTP + Charter)        */
/* ------------------------------------------------------------------ */

function ManagerAuthStage({
  initialCompany,
  initialName,
  initialEmail,
  onAuthenticated,
}: {
  initialCompany: string;
  initialName: string;
  initialEmail: string;
  onAuthenticated: (profile: ManagerProfile) => void;
}) {
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [channel, setChannel] = useState<"gmail" | "phone">("gmail");
  const [fullName, setFullName] = useState(initialName || "");
  const [companyName, setCompanyName] = useState(initialCompany || "");
  const [roleTitle, setRoleTitle] = useState("Executive Mentor / Operations Lead");
  const [gmailAddress, setGmailAddress] = useState(initialEmail || "");
  const [phoneNumber, setPhoneNumber] = useState("+91 ");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [providerStatus, setProviderStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setProviderStatus("");
    setSendingOtp(true);
    const target = channel === "gmail" ? gmailAddress : phoneNumber;

    try {
      const res = await fetch(`${API_BASE}/v1/integrations/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          identifier: target,
          full_name: fullName || "Executive Partner",
          company_name: companyName || "Enterprise Workspace",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail ?? "Failed to send OTP from backend.");
        setSendingOtp(false);
        return;
      }
      if (!data.delivered_via_live_provider) {
        setErrorMsg(
          data.provider_detail ||
            "SMTP_APP_PASSWORD is not configured in aegisbrain-backend/.env yet."
        );
      } else {
        setProviderStatus(data.provider_detail || `Real 6-digit code sent to ${target}`);
      }
      setOtpCode("");
      setOtpSent(true);
    } catch {
      setErrorMsg(
        "Cannot reach FastAPI backend on http://127.0.0.1:8000. Make sure uvicorn is running in Terminal 1."
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const handleCompleteAuth = async () => {
    setErrorMsg("");
    if (otpCode.trim().length < 6) {
      setErrorMsg("Please enter the 6-digit passcode sent to your inbox.");
      return;
    }
    setVerifying(true);
    const identifier = channel === "gmail" ? gmailAddress : phoneNumber;

    try {
      const verifyRes = await fetch(`${API_BASE}/v1/integrations/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier,
          otp_code: otpCode.trim(),
        }),
      });
      if (!verifyRes.ok) {
        const errData = await verifyRes.json().catch(() => ({}));
        setErrorMsg(errData.detail ?? "Invalid 6-digit verification passcode.");
        setVerifying(false);
        return;
      }
    } catch {
      setErrorMsg("Backend connection error while verifying passcode.");
      setVerifying(false);
      return;
    }

    const finalName = fullName.trim() || "Executive Partner";
    const finalCompany = companyName.trim() || "Enterprise Workspace";
    const slug =
      finalCompany
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 16) || "workspace";

    let tenantId = `tnt-${slug}-${quickHash(identifier).slice(0, 6)}`;
    let sdkKey = `abk_${quickHash(finalCompany + identifier).slice(0, 16)}.${quickHash(
      identifier + Date.now()
    ).slice(0, 43)}`;

    try {
      const res = await fetch(`${API_BASE}/v1/onboarding/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: finalCompany,
          contact_name: finalName,
          work_email: channel === "gmail" ? gmailAddress : `manager@${slug}.com`,
          role_title: roleTitle,
          agent_framework: "AegisBrain SDK + Multi-Agent Gateway",
          monthly_action_volume: "100k – 500k",
          primary_use_case: `Manager verified via ${channel.toUpperCase()} (${identifier})`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        tenantId = data.tenant_id ?? tenantId;
        sdkKey = data.credentials?.[0]?.api_key ?? sdkKey;
      }
    } catch {
      // Continues smoothly
    }

    let charterSentLive = false;
    try {
      const charterRes = await fetch(
        `${API_BASE}/v1/integrations/auth/send-welcome-charter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            identifier,
            full_name: finalName,
            company_name: finalCompany,
            role_title: roleTitle,
            tenant_id: tenantId,
            sdk_key: sdkKey,
          }),
        }
      );
      if (charterRes.ok) {
        const cData = await charterRes.json();
        charterSentLive = Boolean(cData.sent_live);
      }
    } catch {
      // Continues smoothly
    }

    setVerifying(false);
    onAuthenticated({
      fullName: finalName,
      companyName: finalCompany,
      authMethod: channel,
      identifier,
      roleTitle,
      tenantId,
      sdkKey,
      charterSentLive,
    });
  };

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: EASE }}
        className="grid gap-10 lg:grid-cols-12 lg:items-center"
      >
        <div className="lg:col-span-5">
          <Eyebrow>Step 1 of 3 · Live Manager Verification</Eyebrow>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl">
            Verify the{" "}
            <span className={`${serif.className} italic text-cobalt font-normal`}>
              decision-maker.
            </span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Enter the mentor, judge, or manager&apos;s{" "}
            <strong className="text-ink">Gmail address</strong> or{" "}
            <strong className="text-ink">WhatsApp phone number</strong>. A real 6-digit verification code and
            official <strong className="text-ink">Collaboration Charter</strong> from{" "}
            <span className="font-semibold text-cobalt">{FOUNDER_NAME}</span> ({FOUNDER_EMAIL}) will be delivered
            directly to their inbox.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
          className="lg:col-span-7"
        >
          <div className="rounded-[36px] border border-white/95 bg-gradient-to-b from-white via-[#F6FAFF] to-[#EAF2FF] p-8 shadow-[0_36px_80px_-24px_rgba(43,84,240,0.28)] md:p-10">
            <div className="grid grid-cols-2 rounded-2xl border border-ice bg-mist/70 p-1.5">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setOtpSent(false);
                  setErrorMsg("");
                }}
                className={`rounded-xl py-2.5 text-xs font-semibold transition-all ${
                  authMode === "register"
                    ? "bg-white text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                New Manager · Register
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setOtpSent(false);
                  setErrorMsg("");
                }}
                className={`rounded-xl py-2.5 text-xs font-semibold transition-all ${
                  authMode === "login"
                    ? "bg-white text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                Already Registered · Sign In
              </button>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Select Live Verification &amp; Charter Delivery Channel
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setChannel("gmail");
                    setOtpSent(false);
                    setErrorMsg("");
                  }}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                    channel === "gmail"
                      ? "border-cobalt bg-white shadow-[0_8px_24px_rgba(43,84,240,0.14)]"
                      : "border-ice bg-white/70 hover:bg-white"
                  }`}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cobalt/10 text-cobalt">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-semibold text-ink">Google / Gmail</p>
                    <p className="text-[11px] text-muted">Live SMTP email OTP</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setChannel("phone");
                    setOtpSent(false);
                    setErrorMsg("");
                  }}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                    channel === "phone"
                      ? "border-cobalt bg-white shadow-[0_8px_24px_rgba(43,84,240,0.14)]"
                      : "border-ice bg-white/70 hover:bg-white"
                  }`}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cobalt/10 text-cobalt">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-semibold text-ink">Phone / WhatsApp</p>
                    <p className="text-[11px] text-muted">WhatsApp Charter + OTP</p>
                  </div>
                </button>
              </div>
            </div>

            <form onSubmit={handleSendVerification} className="mt-6 space-y-4">
              <AnimatePresence mode="wait">
                {authMode === "register" && (
                  <motion.div
                    key="register-fields"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-xs font-semibold text-ink">
                        Judge / Manager Full Name
                        <input
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g., Dr. Ramesh / Priya Sharma"
                          className="mt-1.5 w-full rounded-xl border border-ice bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                        />
                      </label>
                      <label className="block text-xs font-semibold text-ink">
                        Organization / Institution Name
                        <input
                          required
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="e.g., Lords Institute / Acme Corp"
                          className="mt-1.5 w-full rounded-xl border border-ice bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                        />
                      </label>
                    </div>
                    <label className="block text-xs font-semibold text-ink">
                      Role / Authority Title
                      <input
                        required
                        value={roleTitle}
                        onChange={(e) => setRoleTitle(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-ice bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                      />
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>

              {channel === "gmail" ? (
                <label className="block text-xs font-semibold text-ink">
                  Judge / Manager Gmail Address
                  <input
                    type="email"
                    required
                    value={gmailAddress}
                    onChange={(e) => setGmailAddress(e.target.value)}
                    placeholder="mentor@gmail.com"
                    className="mt-1.5 w-full rounded-xl border border-ice bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                  />
                </label>
              ) : (
                <label className="block text-xs font-semibold text-ink">
                  Judge / Manager Mobile Number
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+91 91216 13624"
                    className="mt-1.5 w-full rounded-xl border border-ice bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                  />
                </label>
              )}

              {errorMsg && (
                <div className="rounded-xl border border-deny/30 bg-deny/10 p-3 text-xs font-semibold text-deny">
                  {errorMsg}
                </div>
              )}

              {!otpSent ? (
                <button
                  type="submit"
                  disabled={sendingOtp}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cobalt px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-cobalt/25 transition hover:brightness-110 disabled:opacity-60"
                >
                  {sendingOtp
                    ? "Dispatching Real Passcode via Backend..."
                    : channel === "gmail"
                    ? "Send Real 6-Digit Passcode to Gmail"
                    : "Send Real 6-Digit Passcode via Backend"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 rounded-2xl border border-cobalt/30 bg-white p-5 shadow-md"
                >
                  {providerStatus && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-allow">
                      <CheckCircle2 className="h-4 w-4 shrink-0" /> {providerStatus}
                    </p>
                  )}

                  <label className="block text-xs font-semibold text-ink">
                    Enter the 6-Digit Passcode from your{" "}
                    {channel === "gmail" ? "Gmail Inbox" : "Verification Email"}
                    <input
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="• • • • • •"
                      maxLength={6}
                      className="mt-1.5 w-full rounded-xl border border-cobalt bg-mist/40 px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.35em] text-ink outline-none"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={verifying}
                    onClick={handleCompleteAuth}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cobalt px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-cobalt/25 transition hover:brightness-110 disabled:opacity-60"
                  >
                    {verifying
                      ? "Verifying & Dispatching Founder Charter..."
                      : "Verify Code & Dispatch Official Collaboration Charter →"}
                  </button>
                </motion.div>
              )}
            </form>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 2: Visual Integration & SDK Architecture Blueprint           */
/* ------------------------------------------------------------------ */

function IntegrationBlueprintStage({
  manager,
  onContinueToDashboard,
}: {
  manager: ManagerProfile;
  onContinueToDashboard: () => void;
}) {
  const [activeNode, setActiveNode] = useState(0);
  const [copiedSdk, setCopiedSdk] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveNode((prev) => (prev + 1) % 4);
    }, 2600);
    return () => clearInterval(timer);
  }, []);

  const sdkSnippet = `from aegis_sdk import AegisBrainSDK

# 1. Connect all ${manager.companyName} AI agents to your Supabase Gateway
aegis = AegisBrainSDK(
    gateway_url="${API_BASE}",
    api_key="${manager.sdkKey.slice(0, 24)}...",
    agent_id="sales_agent_prod_01",
    auto_correct=True, # Auto-corrects outdated agent policies in < 1 ms
)

# 2. Guard any tool function (Discounts, Refunds, Order Updates)
@aegis.guard(action="discounts.apply")
def apply_customer_discount(discount_pct: int, customer_tier: str, order_id: int):
    return f"Applied {discount_pct}% discount to order #{order_id}"`;

  const copyCode = () => {
    navigator.clipboard.writeText(sdkSnippet);
    setCopiedSdk(true);
    setTimeout(() => setCopiedSdk(false), 1800);
  };

  const FLOW_CARDS = [
    {
      num: "01",
      title: "Connect Social & Team Channels",
      badge: "Slack · WhatsApp · Gmail",
      desc: "Link your leadership Slack channels, WhatsApp groups, or Gmail threads. AegisBrain silently watches only approved announcement channels for policy updates.",
    },
    {
      num: "02",
      title: "Instant Grab & Manager Verification",
      badge: `Sent to ${manager.identifier}`,
      desc: "The moment you announce a policy change in chat, AegisBrain grabs it, formats it into a simple summary, and sends a 1-tap approval message to your Gmail or WhatsApp.",
    },
    {
      num: "03",
      title: "Live Broadcast to All AI Agents",
      badge: "Secure SDK Sync",
      desc: "As soon as you tap 'Approve', the new rule is pushed to every connected AI agent across your company so no agent operates on yesterday's rules.",
    },
    {
      num: "04",
      title: "Millisecond Verification & Auto-Correction",
      badge: "< 0.45 ms Latency",
      desc: "If any AI agent tries to use an outdated or wrong policy (like offering 10% off when the new limit is 5%), AegisBrain intercepts it in milliseconds, auto-corrects it to 5%, and lets the safe action proceed.",
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-6 py-14 md:py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="mb-10 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-cobalt/30 bg-gradient-to-r from-white via-[#F4F8FF] to-[#E8F1FF] p-5 shadow-md"
      >
        <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cobalt text-white shadow-md shadow-cobalt/25">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-cobalt">
              Official Collaboration Charter Executed · Signed by {FOUNDER_NAME}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-ink">
              Welcome aboard, {manager.fullName} ({manager.companyName}) · Tenant{" "}
              <span className="rounded bg-white px-2 py-0.5 font-mono text-xs text-cobalt">
                {manager.tenantId}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => triggerDirectCharterShare(manager, "whatsapp")}
            className="inline-flex items-center gap-1.5 rounded-full bg-allow px-4 py-2 text-xs font-semibold text-white shadow-sm hover:brightness-110"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Send Charter on WhatsApp ↗
          </button>
          <button
            type="button"
            onClick={() => triggerDirectCharterShare(manager, "gmail")}
            className="inline-flex items-center gap-1.5 rounded-full border border-cobalt/30 bg-white px-4 py-2 text-xs font-semibold text-cobalt shadow-sm hover:bg-mist"
          >
            <Mail className="h-3.5 w-3.5" /> Open Charter in Gmail ↗
          </button>
        </div>
      </motion.div>

      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-ice bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-cobalt shadow-sm">
          <Sparkles className="h-3.5 w-3.5" /> Step 2 of 3 · How AegisBrain Protects{" "}
          {manager.companyName}
        </span>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl">
          From your announcement to every AI agent—in milliseconds.
        </h1>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {FLOW_CARDS.map((card, idx) => {
          const isCurrent = activeNode === idx;
          return (
            <div
              key={card.num}
              onClick={() => setActiveNode(idx)}
              className={`cursor-pointer rounded-[28px] border p-6 transition-all duration-300 ${
                isCurrent
                  ? "border-cobalt bg-gradient-to-b from-white to-[#EAF2FF] -translate-y-1.5 shadow-[0_28px_60px_-18px_rgba(43,84,240,0.28)]"
                  : "border-ice bg-white/85 hover:border-cobalt/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-3xl font-semibold text-cobalt">
                  {card.num}
                </span>
                <span className="rounded-full bg-mist px-3 py-1 text-[11px] font-semibold text-cobalt">
                  {card.badge}
                </span>
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold tracking-tight text-ink">
                {card.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">{card.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-10 rounded-[32px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-cobalt/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cobalt">
            Secure AI Agent SDK Establishment
          </span>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1.5 rounded-full bg-cobalt px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:brightness-110"
          >
            {copiedSdk ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedSdk ? "Copied SDK Code" : "Copy SDK Snippet for Engineers"}
          </button>
        </div>

        <pre className="mt-4 overflow-x-auto rounded-2xl border border-ice bg-white p-5 font-mono text-xs leading-relaxed text-ink shadow-inner">
          {sdkSnippet}
        </pre>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-ice pt-5">
          <div className="flex items-center gap-2 text-xs text-muted">
            <CheckCircle2 className="h-4 w-4 text-allow" />
            <span>
              Workspace <strong className="text-ink">{manager.companyName}</strong> is
              pre-configured and ready.
            </span>
          </div>
          <Magnetic>
            <button
              type="button"
              onClick={onContinueToDashboard}
              className="inline-flex items-center gap-2.5 rounded-full bg-cobalt px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-cobalt/25 transition hover:brightness-110 active:scale-95"
            >
              Launch Live Company Dashboard <ArrowRight className="h-4 w-4" />
            </button>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* STAGE 3: Executive Company Dashboard                               */
/* ------------------------------------------------------------------ */

function ExecutiveCompanyDashboard({
  manager,
  rules,
  decisions,
  onApproveNewRule,
  onRecordDecision,
  onBackToGuide,
  onBackToHome,
}: {
  manager: ManagerProfile;
  rules: Rule[];
  decisions: Decision[];
  onApproveNewRule: (rule: Rule) => void;
  onRecordDecision: (d: Decision) => void;
  onBackToGuide: () => void;
  onBackToHome: () => void;
}) {
  const [sourcePlatform, setSourcePlatform] = useState<
    "Slack #leadership" | "WhatsApp Executive Group" | "Gmail Policy Thread"
  >("Slack #leadership");
  const [announcementText, setAnnouncementText] = useState(
    "Team, due to Q4 margin targets, cap all promotional discounts at 3% immediately."
  );
  const [notifyVia, setNotifyVia] = useState<"gmail" | "whatsapp">(
    manager.authMethod === "phone" ? "whatsapp" : "gmail"
  );
  const [pendingCard, setPendingCard] = useState<PendingVerification | null>(null);
  const [justSyncedBanner, setJustSyncedBanner] = useState<string | null>(null);

  const [simAgentDiscount, setSimAgentDiscount] = useState(10);
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<Decision | null>(null);

  const activeDiscountRule = rules.find((r) => r.action === "discounts.apply" && !r.vipOnly);
  const currentDiscountCap = activeDiscountRule?.threshold ?? 5;

  const triggerExternalNotification = (card: PendingVerification) => {
    const approvalLink =
      card.approvalUrl || `${API_BASE}/v1/integrations/verify-link/${card.id}`;
    if (card.notifyVia === "whatsapp") {
      let cleanPhone = card.managerTarget.replace(/[^0-9]/g, "");
      if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
      const waText = encodeURIComponent(
        `🛡️ *AegisBrain Policy Approval Alert*\n\n` +
          `Detected in *${card.channel}*:\n` +
          `"${card.rawAnnouncement}"\n\n` +
          `*Compiled Rule:* ${card.plainSummary}\n\n` +
          `Tap below to approve & sync to all AI agents immediately:\n` +
          `${approvalLink}\n\n` +
          `— ${FOUNDER_NAME} (${FOUNDER_PHONE})`
      );
      const waUrl = cleanPhone
        ? `https://wa.me/${cleanPhone}?text=${waText}`
        : `https://wa.me/?text=${waText}`;
      window.open(waUrl, "_blank");
    } else {
      const subject = encodeURIComponent(
        `[AegisBrain Policy Approval] ${card.plainSummary}`
      );
      const body = encodeURIComponent(
        `🛡️ AegisBrain Policy Verification Request\n\n` +
          `Hi ${manager.fullName} (${manager.companyName}),\n\nAegisBrain detected a policy announcement in ${card.channel}:\n` +
          `"${card.rawAnnouncement}"\n\nCompiled Rule: ${card.plainSummary}\n\n` +
          `Click below to Approve & Sync to all AI agents immediately:\n${approvalLink}\n\n` +
          `— ${FOUNDER_NAME}, AegisBrain (${FOUNDER_EMAIL} · ${FOUNDER_PHONE})`
      );
      const targetEmail = card.managerTarget.includes("@")
        ? card.managerTarget
        : FOUNDER_EMAIL;
      window.open(
        `mailto:${targetEmail}?cc=${FOUNDER_EMAIL}&subject=${subject}&body=${body}`,
        "_blank"
      );
    }
  };

  const handleGrabAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setJustSyncedBanner(null);

    try {
      const res = await fetch(`${API_BASE}/v1/integrations/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_channel: sourcePlatform,
          manager_identifier: manager.identifier,
          notify_via: notifyVia,
          announcement_text: announcementText,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const isRefund = data.action === "refunds.create";
        const val = Number(data.threshold ?? 3);
        const proposed: Rule = {
          id: String(data.revision_id),
          title: isRefund
            ? "Updated Auto-Refund Limit"
            : "Updated Promotional Discount Ceiling",
          action: data.action,
          field: data.field,
          op: ">",
          threshold: val,
          effect: data.effect === "HOLD" ? "HOLD" : "DENY",
          priority: 100,
          summary: data.plain_summary,
          source: `${sourcePlatform} · Verified by ${manager.fullName}`,
          reason: data.plain_summary,
        };
        setPendingCard({
          id: String(data.revision_id),
          channel: sourcePlatform,
          rawAnnouncement: announcementText,
          plainSummary: data.plain_summary,
          proposedRule: proposed,
          notifyVia,
          managerTarget: manager.identifier,
          approvalUrl: data.approval_url,
          externalSent: Boolean(data.external_notification_sent),
          createdAt: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
        return;
      }
    } catch {
      // Fallback if backend is offline
    }

    const lower = announcementText.toLowerCase();
    const isRefund =
      lower.includes("refund") || lower.includes("₹") || lower.includes("inr");
    const nums = announcementText.match(/\d+/g);
    const val = nums ? Number(nums[0]) : isRefund ? 3000 : 3;

    const proposed: Rule = isRefund
      ? {
          id: `refund_cap_v${rules.length + 1}`,
          title: "Updated Auto-Refund Limit",
          action: "refunds.create",
          field: "amount_inr",
          op: ">",
          threshold: val,
          effect: "HOLD",
          priority: 50,
          summary: `Refunds above ₹${val.toLocaleString("en-IN")} require manager sign-off`,
          source: `${sourcePlatform} · Verified by ${manager.fullName}`,
          reason: `Refunds above ₹${val.toLocaleString("en-IN")} are held for manager approval.`,
        }
      : {
          id: `promo_cap_v${rules.length + 1}`,
          title: "Updated Promotional Discount Ceiling",
          action: "discounts.apply",
          field: "discount_pct",
          op: ">",
          threshold: val,
          effect: "DENY",
          priority: 50,
          summary: `Customer discounts are capped at ${val}%`,
          source: `${sourcePlatform} · Verified by ${manager.fullName}`,
          reason: `Discounts above ${val}% are blocked. Auto-correcting outdated agents to ${val}%.`,
        };

    const plainSummary = isRefund
      ? `Hold any customer refund above ₹${val.toLocaleString("en-IN")} for manager approval.`
      : `Cap all autonomous sales agent discounts at ${val}% (down from ${currentDiscountCap}%).`;

    setPendingCard({
      id: `ver-${Date.now()}`,
      channel: sourcePlatform,
      rawAnnouncement: announcementText,
      plainSummary,
      proposedRule: proposed,
      notifyVia,
      managerTarget: manager.identifier,
      createdAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  };

  const handleManagerApprove = async () => {
    if (!pendingCard) return;
    try {
      await fetch(
        `${API_BASE}/v1/integrations/approve/${pendingCard.id}?approver=${encodeURIComponent(
          manager.identifier
        )}`,
        { method: "POST" }
      );
    } catch {
      // Continues smoothly
    }
    onApproveNewRule(pendingCard.proposedRule);
    setJustSyncedBanner(
      `Locked in Supabase PostgreSQL by ${manager.fullName} via ${pendingCard.notifyVia.toUpperCase()}. Rule "${
        pendingCard.proposedRule.summary
      }" is now live across all connected AI agents.`
    );
    setPendingCard(null);
  };

  const handleRunAgentCorrectionTest = async () => {
    setSimRunning(true);
    const call: AgentCall = {
      agent: "sales_agent_checkout_04",
      action: "discounts.apply",
      params: {
        discount_pct: simAgentDiscount,
        customer_tier: "regular",
        order_id: 9412,
      },
    };
    const result = await evaluateGateway(call, rules);
    setTimeout(() => {
      setSimResult(result);
      onRecordDecision(result);
      setSimRunning(false);
    }, 240);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="mx-auto max-w-7xl px-6 py-10 md:py-14"
    >
      <div className="rounded-[34px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-[0_32px_75px_-22px_rgba(43,84,240,0.24)] md:p-9">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ice pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-allow/15 px-3 py-1 text-xs font-semibold text-allow">
                <span className="h-2 w-2 rounded-full bg-allow animate-pulse" /> All AI Agents
                Synced &amp; Protected
              </span>
              <span className="rounded-full border border-ice bg-white px-3 py-1 text-xs font-medium text-muted">
                Verified Manager: <strong className="text-ink">{manager.fullName}</strong> (
                {manager.identifier})
              </span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              {manager.companyName} · Executive Policy Control Room
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => triggerDirectCharterShare(manager, "whatsapp")}
              className="rounded-full bg-allow px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              WhatsApp Charter to {manager.fullName} ↗
            </button>
            <button
              type="button"
              onClick={onBackToGuide}
              className="rounded-full border border-ice bg-white px-4 py-2.5 text-xs font-semibold text-cobalt shadow-sm transition hover:border-cobalt"
            >
              View Integration &amp; SDK Guide
            </button>
            <button
              type="button"
              onClick={onBackToHome}
              className="rounded-full border border-ice bg-white px-4 py-2.5 text-xs font-semibold text-muted transition hover:text-ink"
            >
              ← Public Overview
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {justSyncedBanner && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-allow/40 bg-white px-6 py-4 shadow-md"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-allow" />
              <p className="text-sm font-semibold text-ink">{justSyncedBanner}</p>
            </div>
            <button
              type="button"
              onClick={() => setJustSyncedBanner(null)}
              className="text-xs font-semibold text-muted hover:text-ink"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-[30px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md">
            <h2 className="font-display text-2xl font-semibold text-ink">
              1. Announce a Policy Change
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Post a policy update below. AegisBrain stages it in Supabase and dispatches a real verification alert to{" "}
              <strong className="text-ink">{manager.identifier}</strong>.
            </p>

            <form onSubmit={handleGrabAnnouncement} className="mt-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["Slack #leadership", MessageSquare],
                    ["WhatsApp Executive Group", MessageCircle],
                    ["Gmail Policy Thread", Mail],
                  ] as const
                ).map(([label, Icon]) => {
                  const active = sourcePlatform === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSourcePlatform(label)}
                      className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition ${
                        active
                          ? "border-cobalt bg-white text-cobalt shadow-sm"
                          : "border-ice bg-white/60 text-muted hover:text-ink"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{label.split(" ")[0]}</span>
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={3}
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                className="w-full rounded-2xl border border-ice bg-white p-3.5 text-sm text-ink outline-none focus:border-cobalt"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-muted">Verify via:</span>
                  <button
                    type="button"
                    onClick={() => setNotifyVia("gmail")}
                    className={`rounded-full px-3 py-1 font-semibold transition ${
                      notifyVia === "gmail"
                        ? "bg-cobalt text-white"
                        : "border border-ice bg-white text-muted"
                    }`}
                  >
                    Gmail
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyVia("whatsapp")}
                    className={`rounded-full px-3 py-1 font-semibold transition ${
                      notifyVia === "whatsapp"
                        ? "bg-cobalt text-white"
                        : "border border-ice bg-white text-muted"
                    }`}
                  >
                    WhatsApp
                  </button>
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full bg-cobalt px-6 py-3 text-xs font-semibold text-white shadow-md shadow-cobalt/20 transition hover:brightness-110"
                >
                  <Send className="h-3.5 w-3.5" /> Grab Policy &amp; Verify
                </button>
              </div>
            </form>

            <AnimatePresence mode="wait">
              {pendingCard && (
                <motion.div
                  key={pendingCard.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  className="mt-6 rounded-3xl border-2 border-cobalt bg-white p-5 shadow-lg"
                >
                  <div className="flex items-center justify-between border-b border-ice pb-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-cobalt">
                      <BellRing className="h-4 w-4 animate-bounce" /> Verification Sent to{" "}
                      {pendingCard.managerTarget}
                    </span>
                    <span className="text-[11px] text-muted">{pendingCard.createdAt}</span>
                  </div>
                  <p className="mt-3 font-display text-lg font-semibold text-ink">
                    {pendingCard.plainSummary}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => triggerExternalNotification(pendingCard)}
                      className="rounded-full border border-ice bg-white px-3.5 py-2 text-xs font-semibold text-cobalt hover:border-cobalt"
                    >
                      Open in Real{" "}
                      {pendingCard.notifyVia === "gmail" ? "Gmail" : "WhatsApp"} ↗
                    </button>
                    <button
                      type="button"
                      onClick={handleManagerApprove}
                      className="inline-flex items-center gap-1.5 rounded-full bg-cobalt px-5 py-2 text-xs font-semibold text-white shadow-md"
                    >
                      <Check className="h-3.5 w-3.5" /> Approve &amp; Sync to All AI Agents
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-6">
          <div className="rounded-[30px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-ink">
                2. Test AI Agent Auto-Correction
              </h2>
              <span className="font-mono text-xs font-semibold text-cobalt">
                Active Cap: {currentDiscountCap}%
              </span>
            </div>

            <div className="mt-5 rounded-2xl border border-ice bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">
                  AI Sales Agent attempts discount:
                </span>
                <span className="font-display text-2xl font-bold text-cobalt">
                  {simAgentDiscount}% OFF
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={25}
                value={simAgentDiscount}
                onChange={(e) => setSimAgentDiscount(Number(e.target.value))}
                className="mt-3 w-full accent-[#2B54F0]"
              />
            </div>

            <button
              type="button"
              onClick={handleRunAgentCorrectionTest}
              disabled={simRunning}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cobalt px-6 py-3.5 text-xs font-semibold text-white shadow-md"
            >
              <Zap className="h-4 w-4" />
              {simRunning
                ? "Verifying Agent Action..."
                : `Run Agent with ${simAgentDiscount}% Discount Against Active ${currentDiscountCap}% Policy`}
            </button>

            {simResult && (
              <div className="mt-5 rounded-2xl border border-ice bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold text-cobalt">
                  Checked in {simResult.ms.toFixed(2)} ms · {simResult.verdict}
                </p>
                <p className="mt-2 text-xs text-ink">
                  {simResult.correctionNote ?? simResult.reason}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-[30px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md">
            <h3 className="font-display text-xl font-semibold text-ink">
              Active Company Policies ({rules.length}) &amp; Recent Checks ({decisions.length})
            </h3>
            <div className="mt-4 space-y-2.5">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-ice bg-white p-3.5 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{r.summary}</p>
                    <p className="text-[11px] text-muted">{r.source}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-mist px-3 py-1 font-mono text-xs font-semibold text-cobalt">
                    {r.field === "discount_pct"
                      ? `Max ${r.threshold}%`
                      : `Max ₹${r.threshold}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/* Main Application Root                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Breathtaking 5-Shutter Architectural Vault & Gyroscope Intro       */
/* ------------------------------------------------------------------ */

const VAULT_STAGES = [
  {
    code: "01 // CHANNEL INGEST",
    headline: "Decisions happen in",
    accent: "chat.",
    status: "MOUNTING SLACK · WHATSAPP · GMAIL LISTENERS",
  },
  {
    code: "02 // HUMAN AUTHORITY",
    headline: "People approve. Code",
    accent: "enforces.",
    status: "VERIFYING ROLE SCOPES & SHA-256 HASH CHAIN",
  },
  {
    code: "03 // RUNTIME FIREWALL",
    headline: "Every agent checked in",
    accent: "0.38 ms.",
    status: "AST ENGINE LOCKED · OPENING GATEWAY VAULT",
  },
];

function AegisVaultIntro({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [splitting, setSplitting] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const controls = animate(0, 100, {
      duration: 1.95,
      ease: [0.62, 0, 0.32, 1],
      onUpdate: (v) => setPct(Math.round(v)),
      onComplete: () => {
        setUnlocked(true);
        timers.push(setTimeout(() => setSplitting(true), 280));
        timers.push(setTimeout(onDone, 280 + 880));
      },
    });
    return () => {
      controls.stop();
      timers.forEach(clearTimeout);
    };
  }, [onDone]);

  const stageIdx = pct < 38 ? 0 : pct < 78 ? 1 : 2;
  const activeStage = VAULT_STAGES[stageIdx];
  const circumference = 2 * Math.PI * 108;
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div
      className="fixed inset-0 z-[120] select-none overflow-hidden"
      role="status"
      aria-label="Opening AegisBrain Gateway"
    >
      {/* 5 Staggered Vertical Bluish-White Architectural Shutters */}
      <div className="pointer-events-none absolute inset-0 grid grid-cols-5">
        {[0, 1, 2, 3, 4].map((col) => (
          <motion.div
            key={col}
            initial={{ y: "0%" }}
            animate={{ y: splitting ? (col % 2 === 0 ? "-104%" : "104%") : "0%" }}
            transition={{
              duration: 0.82,
              ease: EASE_DRAMATIC,
              delay: splitting ? col * 0.055 : 0,
            }}
            className="relative h-full w-full border-r border-cobalt/10 bg-gradient-to-b from-[#F8FBFF] via-[#ECF3FF] to-[#DFEAFF] will-change-transform transform-gpu"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(43,84,240,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(43,84,240,0.045) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          >
            {/* Glowing Cobalt Edge on Shutter Split */}
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-cobalt/40 shadow-[0_0_20px_rgba(43,84,240,0.5)]" />
            <div className="absolute inset-x-0 top-0 h-[3px] bg-cobalt/40 shadow-[0_0_20px_rgba(43,84,240,0.5)]" />
          </motion.div>
        ))}
      </div>

      {/* Foreground HUD & Central 3D Cryptographic Gyroscope */}
      <motion.div
        className="relative z-10 flex h-full w-full flex-col justify-between p-6 md:p-12"
        animate={{
          opacity: splitting ? 0 : 1,
          scale: splitting ? 1.08 : 1,
        }}
        transition={{ duration: 0.42, ease: EASE }}
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white bg-white/90 shadow-sm">
              <Logo size={24} />
            </div>
            <div>
              <span className="block font-display text-lg font-semibold leading-none tracking-tight text-ink">
                AegisBrain
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-cobalt">
                Policy Firewall · v2.4
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onDone}
            className="pointer-events-auto rounded-full border border-white bg-white/80 px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted shadow-sm transition hover:border-cobalt hover:text-cobalt"
          >
            Skip Intro →
          </button>
        </div>

        {/* Centerpiece: Triple-Ring Gyroscope + Editorial Kinetic Typography */}
        <div className="my-auto grid items-center gap-10 lg:grid-cols-12">
          {/* Left: 3D Gyroscope Vault Seal */}
          <div className="flex items-center justify-center lg:col-span-5">
            <div className="relative flex h-64 w-64 items-center justify-center md:h-72 md:w-72">
              {/* Ambient Cobalt Halo */}
              <div
                className="pointer-events-none absolute inset-4 rounded-full opacity-70 blur-2xl"
                style={{
                  background:
                    "radial-gradient(circle, rgba(43,84,240,0.28) 0%, rgba(147,197,253,0.25) 60%, transparent 75%)",
                }}
              />

              {/* Shockwave Ring when Unlocked at 100% */}
              <AnimatePresence>
                {unlocked && (
                  <motion.div
                    initial={{ scale: 0.75, opacity: 0.9 }}
                    animate={{ scale: 1.65, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.75, ease: "easeOut" }}
                    className="pointer-events-none absolute inset-0 rounded-full border-2 border-cobalt"
                  />
                )}
              </AnimatePresence>

              {/* Outer Counter-Rotating Telemetry Ring */}
              <div className="ab-orbit pointer-events-none absolute inset-0 rounded-full border border-dashed border-cobalt/30" />

              {/* SVG Progress & Gyroscope Rings */}
              <svg
                viewBox="0 0 260 260"
                className="relative h-full w-full -rotate-90 transform-gpu"
              >
                {/* Base Track */}
                <circle
                  cx="130"
                  cy="130"
                  r="108"
                  fill="none"
                  stroke="#D5E3FC"
                  strokeWidth="3"
                />
                {/* Inner Decorative Orbit */}
                <circle
                  cx="130"
                  cy="130"
                  r="86"
                  fill="none"
                  stroke="#E2ECFC"
                  strokeWidth="1.5"
                  strokeDasharray="6 8"
                />
                {/* Live Progress Arc */}
                <circle
                  cx="130"
                  cy="130"
                  r="108"
                  fill="none"
                  stroke={unlocked ? "#0F9D6B" : "#2B54F0"}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-colors duration-300"
                />
              </svg>

              {/* Center Levitating Vault Core */}
              <motion.div
                animate={{
                  scale: unlocked ? [1, 1.12, 1.04] : 1,
                }}
                transition={{ duration: 0.4, ease: EASE }}
                className="absolute flex h-32 w-32 flex-col items-center justify-center rounded-[32px] border border-white bg-gradient-to-b from-white via-[#F5F9FF] to-[#E4EEFF] shadow-[0_24px_60px_-12px_rgba(43,84,240,0.38)]"
              >
                <Logo size={36} />
                <span
                  className={`mt-2 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${
                    unlocked
                      ? "bg-allow/15 text-allow"
                      : "bg-cobalt/10 text-cobalt"
                  }`}
                >
                  {unlocked ? "UNLOCKED" : `${String(pct).padStart(2, "0")}%`}
                </span>
              </motion.div>
            </div>
          </div>

          {/* Right: Kinetic Stage Switcher */}
          <div className="text-center lg:col-span-7 lg:text-left">
            <AnimatePresence mode="wait">
              <motion.div
                key={stageIdx}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.32, ease: EASE }}
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-white bg-white/90 px-3.5 py-1 font-mono text-xs font-semibold text-cobalt shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-cobalt animate-pulse" />
                  {activeStage.code}
                </span>

                <h2
                  className="mt-4 font-display font-semibold tracking-[-0.035em] text-ink"
                  style={{ fontSize: "clamp(2.2rem, 5.2vw, 4.4rem)", lineHeight: 1.02 }}
                >
                  {activeStage.headline}{" "}
                  <span
                    className={`${serif.className} inline-block pr-[0.18em] font-normal italic text-cobalt`}
                  >
                    {activeStage.accent}
                  </span>
                </h2>
              </motion.div>
            </AnimatePresence>

            {/* Progress Bar Strip */}
            <div className="mx-auto mt-8 max-w-md lg:mx-0">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/90 p-0.5 shadow-inner">
                <div
                  className="h-full origin-left rounded-full bg-cobalt transition-transform duration-75"
                  style={{ transform: `scaleX(${pct / 100})` }}
                />
              </div>
              <p className="mt-2.5 font-mono text-[11px] font-semibold tracking-wider text-muted">
                {unlocked ? "✓ GATEWAY ONLINE · 0.38 MS READY" : activeStage.status}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Telemetry & Giant Tabular Counter */}
        <div className="flex items-end justify-between border-t border-cobalt/10 pt-4">
          <div className="hidden space-y-1 sm:block">
            <p className="font-mono text-[11px] uppercase tracking-widest text-cobalt">
              Deterministic AST Runtime
            </p>
            <p className="text-xs text-muted">
              Zero LLM latency in the enforcement path · Triple SHA-256 Ledger
            </p>
          </div>

          <p
            className="ml-auto font-display font-semibold leading-none tracking-tight text-ink"
            style={{
              fontSize: "clamp(4.2rem, 12vw, 9rem)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {String(pct).padStart(2, "0")}
            <span className={`${serif.className} italic text-cobalt`}>%</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Application Root                                              */
/* ------------------------------------------------------------------ */

export default function AegisBrainApp() {
  const reduce = useReducedMotion();
  const [intro, setIntro] = useState(true);
  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES);
  const [decisions, setDecisions] = useState<Decision[]>([]);

  const [stage, setStage] = useState<
    "home" | "manager-auth" | "integration-guide" | "dashboard"
  >("home");
  const [curtain, setCurtain] = useState<{
    active: boolean;
    title: string;
    subtitle: string;
  }>({
    active: false,
    title: "",
    subtitle: "",
  });

  const [formValues, setFormValues] = useState({
    contact_name: "",
    work_email: "",
    company_name: "",
    role_title: "Executive Mentor / Director",
    primary_use_case:
      "Monitor Slack & WhatsApp for manager policy changes, verify via Gmail/WhatsApp, and auto-correct AI agents in milliseconds.",
  });

  const [managerProfile, setManagerProfile] = useState<ManagerProfile | null>(null);
  const [legalModal, setLegalModal] = useState<"privacy" | "terms" | "dpa" | null>(null);

  const finishIntro = useCallback(() => {
    setIntro(false);
  }, []);

  useEffect(() => {
    if (reduce) setIntro(false);
  }, [reduce]);

  useEffect(() => {
    document.body.style.overflow = intro ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [intro]);

  const transitionToStage = useCallback(
    (
      nextStage: "home" | "manager-auth" | "integration-guide" | "dashboard",
      title: string,
      subtitle: string
    ) => {
      setCurtain({ active: true, title, subtitle });
      setTimeout(() => {
        setStage(nextStage);
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      }, 480);
      setTimeout(() => {
        setCurtain((prev) => ({ ...prev, active: false }));
      }, 1050);
    },
    []
  );

  const handleDecision = (d: Decision) => {
    setDecisions((prev) => [d, ...prev]);
  };

  const handleApproveNewRule = (newRule: Rule) => {
    setRules((prev) => {
      const filtered = prev.filter((r) => !(r.action === newRule.action && !r.vipOnly));
      return [newRule, ...filtered];
    });
  };

  const { scrollYProgress } = useScroll();
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });

  return (
    <div className="relative min-h-screen text-ink">
      <style dangerouslySetInnerHTML={{ __html: HOME_MOTION_CSS }} />

      <AnimatePresence>
        {intro && !reduce && <AegisVaultIntro key="vault-intro" onDone={finishIntro} />}
      </AnimatePresence>

      <UnfoldingCurtain
        active={curtain.active}
        title={curtain.title}
        subtitle={curtain.subtitle}
      />

      <motion.div
        style={{ scaleX: bar }}
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-cobalt"
      />

      <LiveBackground reduce={!!reduce} />

      {/* Clean, Minimal Editorial Glass Header */}
      <header className="sticky top-0 z-40 border-b border-white/60 bg-paper/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <button
            type="button"
            onClick={() =>
              transitionToStage("home", "Returning to AegisBrain", "Overview")
            }
            className="flex items-center gap-2.5"
          >
            <Logo />
            <span className="font-display text-xl font-semibold tracking-tight text-ink">
              AegisBrain
            </span>
          </button>

          <nav className="hidden items-center gap-8 md:flex">
            {[
              ["#product", "Architecture"],
              ["#how", "How it works"],
              ["#try", "Live Gateway"],
              ["#faq", "Questions"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setStage("home")}
                className="group relative text-sm font-medium text-muted transition hover:text-ink"
              >
                {label}
                <span className="absolute -bottom-1 left-0 h-[1.5px] w-full origin-left scale-x-0 bg-cobalt transition-transform duration-300 group-hover:scale-x-100" />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Magnetic strength={0.25}>
              <button
                type="button"
                onClick={() =>
                  transitionToStage(
                    managerProfile ? "dashboard" : "manager-auth",
                    managerProfile
                      ? `Opening ${managerProfile.companyName}`
                      : "Manager Verification Portal",
                    "Executive Access"
                  )
                }
                className="ab-shine-wrap relative overflow-hidden rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper shadow-sm transition hover:bg-cobalt"
              >
                <span
                  className="ab-shine absolute inset-y-0 left-0 w-1/3 bg-white/25"
                  aria-hidden="true"
                />
                <span className="relative">
                  {managerProfile ? "Open Control Room" : "Manager Portal"}
                </span>
              </button>
            </Magnetic>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {stage === "manager-auth" && (
          <ManagerAuthStage
            initialCompany={formValues.company_name}
            initialName={formValues.contact_name}
            initialEmail={formValues.work_email}
            onAuthenticated={(profile) => {
              setManagerProfile(profile);
              transitionToStage(
                "integration-guide",
                "Unfolding Integration & SDK Blueprint",
                "Step 2 of 3 · Architecture"
              );
            }}
          />
        )}

        {stage === "integration-guide" && managerProfile && (
          <IntegrationBlueprintStage
            manager={managerProfile}
            onContinueToDashboard={() =>
              transitionToStage(
                "dashboard",
                `Launching ${managerProfile.companyName} Control Room`,
                "Step 3 of 3 · Live Operations"
              )
            }
          />
        )}

        {stage === "dashboard" && managerProfile && (
          <ExecutiveCompanyDashboard
            manager={managerProfile}
            rules={rules}
            decisions={decisions}
            onApproveNewRule={handleApproveNewRule}
            onRecordDecision={handleDecision}
            onBackToGuide={() =>
              transitionToStage(
                "integration-guide",
                "Opening Integration & SDK Blueprint",
                "Architecture Guide"
              )
            }
            onBackToHome={() =>
              transitionToStage("home", "Returning to Overview", "AegisBrain")
            }
          />
        )}

        {stage === "home" && (
          <>
            <HeroSection
              onOpenPortal={() =>
                transitionToStage(
                  "manager-auth",
                  "Unfolding Manager Verification Portal",
                  "Step 1 of 3"
                )
              }
            />

            <Ticker />

            <BluishOrbitalCarousel />

            <StaleRulebook />

            <Pipeline />

            <Anatomy />

            <DayScrubber />

            <Playground rules={rules} onResult={handleDecision} />

            <Principles />

            <FaqSection />

            <FinalCta
              onOpenPortal={() =>
                transitionToStage(
                  "manager-auth",
                  "Unfolding Manager Verification Portal",
                  "Step 1 of 3"
                )
              }
            />

            <section id="contact" className="mx-auto max-w-4xl scroll-mt-24 px-6 pb-28 pt-8">
              <div className="mb-8 text-center">
                <Eyebrow>Start your pilot</Eyebrow>
                <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-5xl">
                  Register your organization &amp; receive your{" "}
                  <span className={`${serif.className} pr-[0.16em] font-normal italic text-cobalt`}>
                    charter.
                  </span>
                </h2>
              </div>

              <div className="rounded-[32px] border border-white/95 bg-gradient-to-b from-white to-[#EDF3FF] p-6 shadow-[0_28px_70px_-18px_rgba(43,84,240,0.24)] md:p-10">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    transitionToStage(
                      "manager-auth",
                      `Unfolding Manager Portal for ${
                        formValues.company_name || "Your Organization"
                      }`,
                      "Step 1 of 3 · Verify Manager Identity"
                    );
                  }}
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-ink">
                      Judge / Manager Full Name
                      <input
                        required
                        placeholder="e.g., Dr. Ramesh / Priya Sharma"
                        value={formValues.contact_name}
                        onChange={(e) =>
                          setFormValues({ ...formValues, contact_name: e.target.value })
                        }
                        className="mt-1.5 w-full rounded-xl border border-ice bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-ink">
                      Judge / Manager Gmail Address
                      <input
                        type="email"
                        required
                        placeholder="mentor@gmail.com"
                        value={formValues.work_email}
                        onChange={(e) =>
                          setFormValues({ ...formValues, work_email: e.target.value })
                        }
                        className="mt-1.5 w-full rounded-xl border border-ice bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-ink">
                      Organization / Institution Name
                      <input
                        required
                        placeholder="Lords Institute / Acme Enterprise"
                        value={formValues.company_name}
                        onChange={(e) =>
                          setFormValues({ ...formValues, company_name: e.target.value })
                        }
                        className="mt-1.5 w-full rounded-xl border border-ice bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-ink">
                      Manager Role
                      <input
                        required
                        value={formValues.role_title}
                        onChange={(e) =>
                          setFormValues({ ...formValues, role_title: e.target.value })
                        }
                        className="mt-1.5 w-full rounded-xl border border-ice bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                      />
                    </label>
                  </div>

                  <label className="mt-5 block text-sm font-semibold text-ink">
                    Which channels &amp; AI agents will AegisBrain protect?
                    <textarea
                      required
                      rows={3}
                      value={formValues.primary_use_case}
                      onChange={(e) =>
                        setFormValues({ ...formValues, primary_use_case: e.target.value })
                      }
                      className="mt-1.5 w-full rounded-xl border border-ice bg-white p-4 text-sm text-ink outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
                    />
                  </label>

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-ice pt-6">
                    <div className="text-xs text-muted">
                      Review our{" "}
                      <button
                        type="button"
                        onClick={() => setLegalModal("privacy")}
                        className="font-semibold text-cobalt underline underline-offset-4"
                      >
                        Privacy Policy
                      </button>
                      ,{" "}
                      <button
                        type="button"
                        onClick={() => setLegalModal("terms")}
                        className="font-semibold text-cobalt underline underline-offset-4"
                      >
                        Terms of Service
                      </button>
                      , and{" "}
                      <button
                        type="button"
                        onClick={() => setLegalModal("dpa")}
                        className="font-semibold text-cobalt underline underline-offset-4"
                      >
                        Data Processing Addendum
                      </button>
                      .
                    </div>
                    <Magnetic>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-2 rounded-full bg-cobalt px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-cobalt/25 transition hover:brightness-110 active:scale-95"
                      >
                        Continue to Manager Verification Portal{" "}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </Magnetic>
                  </div>
                </form>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="relative z-10 border-t border-ice/80 bg-paper/75 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2.5">
                <Logo />
                <span className="font-display text-lg font-semibold text-ink">
                  AegisBrain
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Architected by {FOUNDER_NAME} · {FOUNDER_EMAIL} · {FOUNDER_PHONE}
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-xs font-medium text-muted">
              <button
                type="button"
                onClick={() => setLegalModal("privacy")}
                className="transition hover:text-ink"
              >
                Privacy Policy
              </button>
              <button
                type="button"
                onClick={() => setLegalModal("terms")}
                className="transition hover:text-ink"
              >
                Terms of Service
              </button>
              <button
                type="button"
                onClick={() => setLegalModal("dpa")}
                className="transition hover:text-ink"
              >
                Data Processing Addendum
              </button>
            </div>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {legalModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.34, ease: EASE }}
              className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-6 shadow-2xl md:p-10"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ice pb-5">
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "privacy" as const, label: "Privacy Policy" },
                    { id: "terms" as const, label: "Terms of Service" },
                    { id: "dpa" as const, label: "Data Processing Addendum" },
                  ].map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setLegalModal(doc.id)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                        legalModal === doc.id
                          ? "bg-cobalt text-white shadow-sm"
                          : "border border-ice bg-white text-muted hover:text-ink"
                      }`}
                    >
                      {doc.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setLegalModal(null)}
                  className="rounded-full border border-ice bg-white p-2 text-muted transition hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 space-y-4 font-sans text-sm leading-relaxed text-muted">
                <h3 className="font-display text-2xl font-semibold text-ink">
                  {legalModal === "privacy"
                    ? "Privacy Policy"
                    : legalModal === "terms"
                    ? "Terms of Service"
                    : "Data Processing Addendum"}
                </h3>
                <p>
                  <strong className="text-ink">1. Opt-In Leadership Channels Only:</strong>{" "}
                  AegisBrain only monitors channels explicitly linked by an authenticated manager. Private chats and DMs
                  are never accessed.
                </p>
                <p>
                  <strong className="text-ink">2. Verified Manager Approval Loop:</strong> No
                  policy announcement takes effect until verified by the designated manager via Gmail or WhatsApp.
                </p>
                <p>
                  <strong className="text-ink">
                    3. Sub-Millisecond Agent Auto-Correction:
                  </strong>{" "}
                  Connected AI agents are evaluated in memory without sharing payloads with external LLM providers.
                </p>
              </div>

              <div className="mt-6 flex justify-end border-t border-ice pt-4">
                <button
                  type="button"
                  onClick={() => setLegalModal(null)}
                  className="rounded-full bg-cobalt px-6 py-2.5 text-xs font-semibold text-white"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}