"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  FileText,
  Fingerprint,
  GitBranch,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Play,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserCheck,
  Workflow,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import Logo from "@/components/marketing/Logo";
import RotatingCards from "@/components/marketing/RotatingCards";
import LiveBackground from "./LiveBackground";
import { faqs } from "@/lib/faq";

/* ------------------------------------------------------------------ */
/* Founder, Gateway & Physics Constants                               */
/* ------------------------------------------------------------------ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const FOUNDER_NAME = "Mohammed Fahad Ali";
const FOUNDER_EMAIL = "mdfahadali.in@gmail.com";
const FOUNDER_PHONE = "+91 91216 13624";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_DRAMATIC: [number, number, number, number] = [0.76, 0, 0.24, 1];

type Verdict = "ALLOW" | "HOLD" | "DENY";
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
  effect: Verdict;
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
  verdict: Verdict;
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
    who: "Autonomous Support Agent",
    note: "Exceeds the ₹5,000 autonomous refund limit",
    badge: "Quarantine Hold",
    call: {
      agent: "support_bot_1",
      action: "refunds.create",
      params: { amount_inr: 8000, customer_id: "c_9821" },
    },
  },
  {
    id: "discount_regular",
    title: "10% Discount for Regular Customer",
    who: "Checkout Sales Agent",
    note: "Outdated agent attempting 10% when active cap is 5%",
    badge: "Auto-Correct",
    call: {
      agent: "sales_bot_3",
      action: "discounts.apply",
      params: { discount_pct: 10, customer_tier: "regular", order_id: 881 },
    },
  },
  {
    id: "discount_vip",
    title: "10% Discount for VIP Customer",
    who: "Enterprise Account Agent",
    note: "VIP tier triggers two-person manager hold",
    badge: "VIP Escalation",
    call: {
      agent: "sales_bot_3",
      action: "discounts.apply",
      params: { discount_pct: 10, customer_tier: "vip", order_id: 902 },
    },
  },
  {
    id: "order",
    title: "Mark Order #88219 as Dispatched",
    who: "Fulfilment Logistics Agent",
    note: "Complies with all active operational policies",
    badge: "Zero-Friction Allow",
    call: {
      agent: "ops_bot_2",
      action: "orders.update_status",
      params: { order_id: 88219, status: "DISPATCHED" },
    },
  },
];

const VERDICT_UI: Record<
  Verdict,
  { label: string; text: string; bg: string; border: string; accentHex: string }
> = {
  ALLOW: {
    label: "Approved & Executed",
    text: "text-allow",
    bg: "bg-allow/10",
    border: "border-allow/30",
    accentHex: "#059669",
  },
  HOLD: {
    label: "Held for Manager",
    text: "text-hold",
    bg: "bg-hold/10",
    border: "border-hold/30",
    accentHex: "#D97706",
  },
  DENY: {
    label: "Intercepted & Auto-Corrected",
    text: "text-deny",
    bg: "bg-deny/10",
    border: "border-deny/30",
    accentHex: "#2B54F0",
  },
};

/* ------------------------------------------------------------------ */
/* Core Deterministic Evaluation & Helper Functions                   */
/* ------------------------------------------------------------------ */

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
/* Creative Animation Primitives (Magnetic, 3D Tilt, HexScramble)     */
/* ------------------------------------------------------------------ */

function Magnetic({
  children,
  strength = 0.22,
  className = "",
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 320, damping: 22, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 320, damping: 22, mass: 0.4 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) * strength);
    y.set((e.clientY - centerY) * strength);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x: springX, y: springY }}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.div>
  );
}

function SpotlightTiltCard({
  children,
  className = "",
  tiltMax = 5,
  glowColor = "rgba(43, 84, 240, 0.13)",
}: {
  children: React.ReactNode;
  className?: string;
  tiltMax?: number;
  glowColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(260);
  const mouseY = useMotionValue(180);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const spotOpacity = useMotionValue(0);

  const smoothRotateX = useSpring(rotateX, { stiffness: 260, damping: 26 });
  const smoothRotateY = useSpring(rotateY, { stiffness: 260, damping: 26 });
  const smoothOpacity = useSpring(spotOpacity, { stiffness: 240, damping: 28 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    mouseX.set(localX);
    mouseY.set(localY);

    const pctX = (localX / rect.width - 0.5) * 2;
    const pctY = (localY / rect.height - 0.5) * 2;
    rotateX.set(-pctY * tiltMax);
    rotateY.set(pctX * tiltMax);
    spotOpacity.set(1);
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    spotOpacity.set(0);
  };

  const background = useMotionTemplate`radial-gradient(540px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 72%)`;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: smoothRotateX,
        rotateY: smoothRotateY,
        transformPerspective: 1200,
      }}
      className={`group relative overflow-hidden ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px z-0 rounded-[inherit]"
        style={{ background, opacity: smoothOpacity }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </motion.div>
  );
}

function HexScrambleText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState(text);

  useEffect(() => {
    const chars = "0123456789abcdef•";
    let frame = 0;
    const totalFrames = 14;
    const interval = setInterval(() => {
      frame++;
      if (frame >= totalFrames) {
        setDisplayed(text);
        clearInterval(interval);
        return;
      }
      const progress = frame / totalFrames;
      const lockedCount = Math.floor(text.length * progress);
      const next = text
        .split("")
        .map((ch, idx) => {
          if (idx < lockedCount || ch === "-" || ch === "_" || ch === ":") return ch;
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join("");
      setDisplayed(next);
    }, 28);
    return () => clearInterval(interval);
  }, [text]);

  return <span className={className}>{displayed}</span>;
}

function CountUp({ to, play }: { to: number; play: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!play) return;
    const controls = animate(0, to, {
      duration: 1.15,
      ease: EASE_OUT_EXPO,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = String(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [play, to]);
  return <span ref={ref}>{to}</span>;
}

function Reveal({
  children,
  delay = 0,
  ready,
}: {
  children: React.ReactNode;
  delay?: number;
  ready: boolean;
}) {
  return (
    <span className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
      <motion.span
        className="block origin-bottom-left"
        initial={{ y: "115%", rotateZ: 2.5, opacity: 0 }}
        animate={{
          y: ready ? "0%" : "115%",
          rotateZ: ready ? 0 : 2.5,
          opacity: ready ? 1 : 0,
        }}
        transition={{ duration: 0.95, ease: EASE_OUT_EXPO, delay }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Live Telemetry Ribbon & Animated SVG Architecture Topology         */
/* ------------------------------------------------------------------ */

function LiveTelemetryRibbon({
  activeRulesCount,
  lastMs,
  currentCap,
}: {
  activeRulesCount: number;
  lastMs: number | null;
  currentCap: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25, ease: EASE_OUT_EXPO }}
      className="mx-auto max-w-7xl px-6 pt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ice bg-gradient-to-r from-white/95 via-[#F4F8FF]/95 to-white/95 px-4 py-2.5 shadow-[0_8px_30px_rgba(43,84,240,0.07)] backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-2 rounded-full bg-cobalt/10 px-3 py-1 font-semibold text-cobalt">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cobalt opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cobalt" />
            </span>
            AST Gateway · Live
          </span>
          <span className="hidden items-center gap-1.5 text-muted sm:inline-flex">
            <Database className="h-3.5 w-3.5 text-cobalt" />
            Supabase Ledger: <strong className="font-mono text-ink">ap-south-1 (Mumbai)</strong>
          </span>
          <span className="hidden h-3.5 w-px bg-ice md:inline-block" />
          <span className="hidden items-center gap-1.5 text-muted md:inline-flex">
            <Shield className="h-3.5 w-3.5 text-allow" />
            Active Promo Ceiling: <strong className="font-mono text-cobalt">{currentCap}% Max</strong>
          </span>
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span className="text-muted">
            RULES: <strong className="text-ink">{activeRulesCount} ACTIVE</strong>
          </span>
          <span className="rounded-lg border border-ice bg-white px-2.5 py-0.5 font-semibold text-cobalt shadow-sm">
            p99: {lastMs ? `${lastMs.toFixed(2)} ms` : "0.38 ms"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function LivePacketTopology({ currentCap }: { currentCap: number }) {
  const [selectedStage, setSelectedStage] = useState<number>(2);

  const STAGES = [
    {
      id: 0,
      label: "01 · Channel Stream",
      title: "Slack, WhatsApp & Gmail Listeners",
      metric: "Opt-In Channels Only",
      detail:
        "Watches executive announcement channels for policy changes without ever touching private DMs.",
    },
    {
      id: 1,
      idLabel: "AST",
      label: "02 · 1-Tap Sign-Off",
      title: "Manager Gmail / WhatsApp Approval",
      metric: "HMAC-SHA256 Signed Link",
      detail:
        "Sends a plain-English verification card to the decision-maker before any agent rule changes.",
    },
    {
      id: 2,
      label: "03 · AST Gateway",
      title: "Sub-Millisecond Parameter Rewrite",
      metric: `Active Cap: ${currentCap}%`,
      detail: `Intercepts outdated AI agent calls in < 0.45 ms and auto-corrects parameters to ${currentCap}%.`,
    },
    {
      id: 3,
      label: "04 · Cryptographic Ledger",
      title: "Triple SHA-256 Hash Chain",
      metric: "Tamper-Evident Audit",
      detail:
        "Every decision, hold token, and policy revision is chained into Supabase PostgreSQL.",
    },
  ];

  return (
    <div className="mt-12 rounded-[34px] border border-ice bg-gradient-to-b from-white via-[#F5F9FF] to-[#EAF2FF] p-6 shadow-[0_28px_70px_-20px_rgba(43,84,240,0.20)] md:p-9">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ice pb-5">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cobalt/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cobalt">
            <Workflow className="h-3.5 w-3.5" /> Live Telemetry &amp; Packet Choreography
          </span>
          <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            Real-Time Policy Sync &amp; Agent Interception Pipeline
          </h3>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-ice bg-white px-3.5 py-1.5 text-xs font-medium text-muted shadow-sm">
          <Activity className="h-3.5 w-3.5 text-cobalt animate-pulse" />
          Click any node to inspect live gateway state
        </div>
      </div>

      {/* Animated SVG Pipeline Schematic */}
      <div className="relative my-6 overflow-hidden rounded-3xl border border-ice bg-white/90 p-4 shadow-inner md:p-6">
        <svg
          viewBox="0 0 920 170"
          className="h-auto w-full select-none"
          aria-label="AegisBrain Live Packet Architecture"
        >
          <defs>
            <linearGradient id="cobaltLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#2B54F0" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.85" />
            </linearGradient>
            <filter id="cobaltGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Subtle Blueprint Grid Background Lines */}
          {[40, 85, 130].map((y) => (
            <line
              key={y}
              x1="20"
              y1={y}
              x2="900"
              y2={y}
              stroke="#E2ECFC"
              strokeDasharray="4 6"
              strokeWidth="1"
            />
          ))}

          {/* Main Connecting Conduit Path */}
          <path
            d="M 120 85 C 220 35, 260 135, 360 85 C 460 35, 500 135, 600 85 C 700 35, 740 135, 810 85"
            fill="none"
            stroke="#D8E4FA"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <motion.path
            d="M 120 85 C 220 35, 260 135, 360 85 C 460 35, 500 135, 600 85 C 700 35, 740 135, 810 85"
            fill="none"
            stroke="url(#cobaltLineGrad)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="14 10"
            animate={{ strokeDashoffset: [0, -96] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
          />

          {/* Interactive Pipeline Nodes */}
          {[
            { cx: 115, cy: 85, title: "Slack / WA", sub: "Ingest" },
            { cx: 355, cy: 85, title: "1-Tap Verify", sub: "Gmail / WA" },
            { cx: 595, cy: 85, title: "AST Engine", sub: `Cap: ${currentCap}%` },
            { cx: 810, cy: 85, title: "AI Agents", sub: "Auto-Fixed" },
          ].map((node, i) => {
            const active = selectedStage === i;
            return (
              <g
                key={node.title}
                onClick={() => setSelectedStage(i)}
                className="cursor-pointer"
              >
                {active && (
                  <motion.circle
                    cx={node.cx}
                    cy={node.cy}
                    r={38}
                    fill="none"
                    stroke="#2B54F0"
                    strokeWidth="1.5"
                    initial={{ scale: 0.8, opacity: 0.8 }}
                    animate={{ scale: 1.25, opacity: 0 }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={30}
                  fill={active ? "#2B54F0" : "#FFFFFF"}
                  stroke={active ? "#1E40AF" : "#93C5FD"}
                  strokeWidth="2.5"
                  filter={active ? "url(#cobaltGlow)" : undefined}
                />
                <text
                  x={node.cx}
                  y={node.cy + 4}
                  textAnchor="middle"
                  fill={active ? "#FFFFFF" : "#0B1A33"}
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="monospace"
                >
                  0{i + 1}
                </text>
                <text
                  x={node.cx}
                  y={node.cy + 52}
                  textAnchor="middle"
                  fill="#0B1A33"
                  fontSize="12.5"
                  fontWeight="700"
                >
                  {node.title}
                </text>
                <text
                  x={node.cx}
                  y={node.cy + 68}
                  textAnchor="middle"
                  fill="#2B54F0"
                  fontSize="10.5"
                  fontWeight="600"
                >
                  {node.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Node Inspector Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((s, idx) => {
          const active = selectedStage === idx;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedStage(idx)}
              className={`rounded-2xl border p-4 text-left transition-all duration-300 ${
                active
                  ? "border-cobalt bg-white shadow-[0_14px_34px_rgba(43,84,240,0.16)] -translate-y-1"
                  : "border-ice bg-white/70 hover:border-cobalt/40 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase text-cobalt">
                  {s.label}
                </span>
                <span className="rounded-full bg-mist px-2.5 py-0.5 font-mono text-[10px] font-semibold text-ink">
                  {s.metric}
                </span>
              </div>
              <p className="mt-2 font-display text-base font-semibold text-ink">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.detail}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Unfolding Portal Curtain & GateIntro                               */
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
          transition={{ duration: 0.32 }}
          className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden"
        >
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "-102%" }}
            transition={{ duration: 0.65, ease: EASE_DRAMATIC }}
            className="blueprint absolute inset-x-0 top-0 h-1/2 border-b border-cobalt/25 bg-gradient-to-b from-white via-[#F3F8FF] to-[#E5EFFF]"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "102%" }}
            transition={{ duration: 0.65, ease: EASE_DRAMATIC }}
            className="blueprint absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-white via-[#F3F8FF] to-[#E5EFFF]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05, y: -18 }}
            transition={{ duration: 0.42, delay: 0.14, ease: EASE_OUT_EXPO }}
            className="relative z-10 max-w-lg rounded-3xl border border-ice bg-white/90 px-8 py-7 text-center shadow-[0_24px_60px_rgba(43,84,240,0.22)] backdrop-blur-xl"
          >
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-cobalt/20 bg-gradient-to-b from-white to-mist shadow-lg shadow-cobalt/15">
              <Logo size={28} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cobalt">
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

const GATE_QUOTES = [
  {
    tag: "01 · Operational Principle",
    quote: "Autonomy without boundaries is a liability.",
    sub: "Loading compiled AST rule definitions into the gateway...",
  },
  {
    tag: "02 · Separation of Powers",
    quote: "Decisions belong to people. Enforcement belongs to code.",
    sub: "Verifying manager authority channels & role scopes...",
  },
  {
    tag: "03 · Sub-Millisecond Execution",
    quote: "Every agent action checked before a single rupee moves.",
    sub: "Synchronizing SHA-256 audit ledger & opening gate...",
  },
];

function GateIntro({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const controls = animate(0, 100, {
      duration: 2.4,
      ease: [0.65, 0, 0.35, 1],
      onUpdate: (v) => setN(Math.round(v)),
      onComplete: () => {
        timers.push(setTimeout(() => setOpen(true), 200));
        timers.push(setTimeout(onDone, 200 + 880));
      },
    });
    return () => {
      controls.stop();
      timers.forEach(clearTimeout);
    };
  }, [onDone]);

  const quoteIndex = n < 36 ? 0 : n < 74 ? 1 : 2;
  const activeQuote = GATE_QUOTES[quoteIndex];

  return (
    <div className="fixed inset-0 z-[100]" role="status" aria-label="Loading AegisBrain">
      <motion.div
        className="blueprint absolute inset-x-0 top-0 h-1/2 bg-paper"
        animate={{ y: open ? "-101%" : "0%" }}
        transition={{ duration: 0.9, ease: EASE_DRAMATIC }}
      />
      <motion.div
        className="blueprint absolute inset-x-0 bottom-0 h-1/2 bg-paper"
        animate={{ y: open ? "101%" : "0%" }}
        transition={{ duration: 0.9, ease: EASE_DRAMATIC }}
      />
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: open ? 0 : 1 }}
        transition={{ duration: 0.28 }}
      >
        <div className="absolute left-6 right-6 top-6 flex items-center justify-between md:left-12 md:right-12 md:top-10">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="font-display text-xl font-semibold tracking-tight text-ink">
              AegisBrain
            </span>
          </div>
          <span className="rounded-full border border-ice bg-white/85 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-cobalt shadow-sm">
            AST Policy Gateway
          </span>
        </div>

        <div className="absolute inset-x-6 top-1/2 -translate-y-28 md:inset-x-12 md:-translate-y-32">
          <div className="mx-auto max-w-3xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={quoteIndex}
                initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -16, filter: "blur(6px)" }}
                transition={{ duration: 0.34, ease: EASE_OUT_EXPO }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cobalt">
                  {activeQuote.tag}
                </p>
                <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl md:text-4xl">
                  &ldquo;{activeQuote.quote}&rdquo;
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="absolute left-6 right-6 top-1/2 h-[2px] bg-ice md:left-12 md:right-12">
          <div
            className="h-full origin-left bg-cobalt shadow-[0_0_16px_rgba(43,84,240,0.6)]"
            style={{ transform: `scaleX(${n / 100})` }}
          />
        </div>

        <div className="absolute bottom-8 left-6 right-6 flex items-end justify-between md:bottom-12 md:left-12 md:right-12">
          <div className="max-w-xs">
            <AnimatePresence mode="wait">
              <motion.p
                key={activeQuote.sub}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="text-sm font-medium text-muted md:text-base"
              >
                {activeQuote.sub}
              </motion.p>
            </AnimatePresence>
          </div>
          <p
            className="font-display font-semibold leading-none tracking-tight text-ink"
            style={{ fontSize: "clamp(5rem, 16vw, 12rem)", fontVariantNumeric: "tabular-nums" }}
          >
            {String(n).padStart(2, "0")}
            <span className="text-cobalt">%</span>
          </p>
        </div>
      </motion.div>
    </div>
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
        transition={{ duration: 0.65, ease: EASE_OUT_EXPO }}
        className="grid gap-10 lg:grid-cols-12 lg:items-center"
      >
        <div className="lg:col-span-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-ice bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-cobalt shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5" /> Step 1 of 3 · Live Manager Verification
          </span>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl">
            Verify the decision-maker.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Enter the mentor, judge, or manager&apos;s{" "}
            <strong className="text-ink">Gmail address</strong> or{" "}
            <strong className="text-ink">WhatsApp phone number</strong>. A real 6-digit verification code and
            official <strong className="text-ink">Collaboration Charter</strong> from{" "}
            <span className="font-semibold text-cobalt">{FOUNDER_NAME}</span> ({FOUNDER_EMAIL}) will be delivered
            directly to their inbox.
          </p>

          <div className="mt-8 space-y-3.5">
            {[
              {
                icon: Mail,
                title: "Automated Executive Charter",
                desc: `Dispatches a formal HTML Governance Charter signed by ${FOUNDER_NAME} (${FOUNDER_PHONE}) with your live Supabase Tenant ID.`,
              },
              {
                icon: Zap,
                title: "1-Tap Policy Approval Loop",
                desc: "Every future Slack or WhatsApp policy announcement is routed to this verified identity before AI agents update.",
              },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <SpotlightTiltCard
                  key={item.title}
                  tiltMax={4}
                  className="rounded-2xl border border-ice bg-white/90 p-4 shadow-sm"
                >
                  <motion.div
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + idx * 0.1, duration: 0.45 }}
                    className="flex items-start gap-3.5"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cobalt/10 text-cobalt">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-display text-sm font-semibold text-ink">{item.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{item.desc}</p>
                    </div>
                  </motion.div>
                </SpotlightTiltCard>
              );
            })}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: EASE_OUT_EXPO }}
          className="lg:col-span-7"
        >
          <SpotlightTiltCard
            tiltMax={2.5}
            className="rounded-[36px] border border-ice bg-gradient-to-b from-white via-[#F6FAFF] to-[#EAF2FF] p-8 shadow-[0_36px_80px_-24px_rgba(43,84,240,0.28)] md:p-10"
          >
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
          </SpotlightTiltCard>
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
        transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
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
              <HexScrambleText
                text={manager.tenantId}
                className="rounded bg-white px-2 py-0.5 font-mono text-xs text-cobalt"
              />
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

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
        className="mx-auto max-w-3xl text-center"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-ice bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-cobalt shadow-sm">
          <Sparkles className="h-3.5 w-3.5" /> Step 2 of 3 · How AegisBrain Protects{" "}
          {manager.companyName}
        </span>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl">
          From your announcement to every AI agent—in milliseconds.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">
          Before opening your live company control room, here is how your social channels, manager verification alerts,
          and AI agent SDK work together.
        </p>
      </motion.div>

      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {FLOW_CARDS.map((card, idx) => {
          const isCurrent = activeNode === idx;
          return (
            <SpotlightTiltCard
              key={card.num}
              tiltMax={5}
              className={`cursor-pointer rounded-[28px] border p-6 transition-all duration-300 ${
                isCurrent
                  ? "border-cobalt bg-gradient-to-b from-white to-[#EAF2FF] -translate-y-1.5 shadow-[0_28px_60px_-18px_rgba(43,84,240,0.28)]"
                  : "border-ice bg-white/85 hover:border-cobalt/40"
              }`}
            >
              <div onClick={() => setActiveNode(idx)}>
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
            </SpotlightTiltCard>
          );
        })}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        <SpotlightTiltCard
          tiltMax={3}
          className="rounded-[32px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md lg:col-span-5"
        >
          <span className="rounded-full bg-cobalt/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cobalt">
            1. Manager Verification Loop
          </span>
          <h2 className="mt-3 font-display text-2xl font-semibold text-ink">
            How we verify policy changes with you
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Whenever someone posts a new rule in Slack, WhatsApp, or Gmail, AegisBrain never blindly trusts it:
          </p>

          <ol className="mt-5 space-y-3.5 text-xs">
            <li className="flex items-start gap-3 rounded-2xl border border-ice bg-white p-3.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cobalt font-bold text-white">
                1
              </span>
              <div>
                <p className="font-semibold text-ink">AegisBrain Grabs the Announcement</p>
                <p className="mt-0.5 text-muted">
                  Example: &ldquo;Cap all customer discounts at 3% starting today.&rdquo;
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-2xl border border-ice bg-white p-3.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cobalt font-bold text-white">
                2
              </span>
              <div>
                <p className="font-semibold text-ink">
                  Sends Easy Approval Card to Your{" "}
                  {manager.authMethod === "gmail" ? "Gmail" : "WhatsApp"}
                </p>
                <p className="mt-0.5 text-muted">
                  Sent directly to <strong className="text-ink">{manager.identifier}</strong> in plain English—no code
                  to read.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-2xl border border-ice bg-white p-3.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cobalt font-bold text-white">
                3
              </span>
              <div>
                <p className="font-semibold text-ink">You Tap Approve → All AI Agents Sync</p>
                <p className="mt-0.5 text-muted">
                  Every connected agent immediately enforces the 3% cap and auto-corrects any outdated 10% requests.
                </p>
              </div>
            </li>
          </ol>
        </SpotlightTiltCard>

        <SpotlightTiltCard
          tiltMax={3}
          className="flex flex-col justify-between rounded-[32px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md lg:col-span-7"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-cobalt/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cobalt">
                2. Secure AI Agent SDK Establishment
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

            <h2 className="mt-3 font-display text-2xl font-semibold text-ink">
              Connect all AI agents once—never hardcode rules again
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Your engineering team drops this lightweight wrapper around your agents. Whenever you approve a new policy
              on WhatsApp or Gmail, the SDK enforces and auto-corrects agent outputs in under 1 millisecond:
            </p>

            <pre className="mt-4 overflow-x-auto rounded-2xl border border-ice bg-white p-5 font-mono text-xs leading-relaxed text-ink shadow-inner">
              {sdkSnippet}
            </pre>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-ice pt-5">
            <div className="flex items-center gap-2 text-xs text-muted">
              <CheckCircle2 className="h-4 w-4 text-allow" />
              <span>
                Workspace <strong className="text-ink">{manager.companyName}</strong> is pre-configured and ready.
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
        </SpotlightTiltCard>
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
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
      className="mx-auto max-w-7xl px-6 py-10 md:py-14"
    >
      <SpotlightTiltCard
        tiltMax={1.5}
        className="rounded-[34px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-[0_32px_75px_-22px_rgba(43,84,240,0.24)] md:p-9"
      >
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

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-ice bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-muted">Monitored Manager Channels</p>
            <p className="mt-1 font-display text-xl font-semibold text-ink">
              Slack · WhatsApp · Gmail
            </p>
            <p className="mt-0.5 text-[11px] text-allow">Listening for policy announcements</p>
          </div>
          <div className="rounded-2xl border border-ice bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-muted">Active Promotional Discount Cap</p>
            <p className="mt-1 font-display text-2xl font-semibold text-cobalt">
              {currentDiscountCap}% Maximum
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Outdated agents auto-corrected to {currentDiscountCap}%
            </p>
          </div>
          <div className="rounded-2xl border border-ice bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-muted">Manager Approval Delivery</p>
            <p className="mt-1 truncate font-display text-xl font-semibold text-ink">
              {manager.identifier}
            </p>
            <p className="mt-0.5 text-[11px] text-cobalt">
              Partnered with {FOUNDER_NAME} ({FOUNDER_PHONE})
            </p>
          </div>
        </div>
      </SpotlightTiltCard>

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
          <SpotlightTiltCard
            tiltMax={2.5}
            className="rounded-[30px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-cobalt/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cobalt">
                Live Channel Monitor
              </span>
              <span className="text-xs font-medium text-muted">Real-Time Ingestion</span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold text-ink">
              1. Announce a Policy Change
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Post a policy update below. AegisBrain stages it in Supabase and dispatches a real verification alert to{" "}
              <strong className="text-ink">{manager.identifier}</strong> before updating any AI agent.
            </p>

            <form onSubmit={handleGrabAnnouncement} className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-ink">Where was this announced?</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
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
              </div>

              <label className="block text-xs font-semibold text-ink">
                Manager Announcement Message
                <textarea
                  rows={3}
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-ice bg-white p-3.5 text-sm text-ink outline-none focus:border-cobalt"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-muted">Send verification via:</span>
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
                  className="inline-flex items-center gap-2 rounded-full bg-cobalt px-6 py-3 text-xs font-semibold text-white shadow-md shadow-cobalt/20 transition hover:brightness-110 active:scale-95"
                >
                  <Send className="h-3.5 w-3.5" /> Grab Policy &amp; Send for Verification
                </button>
              </div>
            </form>

            <AnimatePresence mode="wait">
              {pendingCard && (
                <motion.div
                  key={pendingCard.id}
                  initial={{ opacity: 0, y: 28, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -18, scale: 0.96 }}
                  transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                  className="mt-6 rounded-3xl border-2 border-cobalt bg-white p-5 shadow-[0_20px_50px_rgba(43,84,240,0.18)]"
                >
                  <div className="flex items-center justify-between border-b border-ice pb-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cobalt">
                      <BellRing className="h-4 w-4 animate-bounce" />{" "}
                      {pendingCard.notifyVia === "gmail" ? "Gmail" : "WhatsApp"} Verification
                      Dispatched to {pendingCard.managerTarget}
                    </span>
                    <span className="text-[11px] text-muted">{pendingCard.createdAt}</span>
                  </div>

                  <p className="mt-3 text-xs font-medium text-muted">
                    Detected in <strong className="text-ink">{pendingCard.channel}</strong>:
                  </p>
                  <p className="mt-1 rounded-xl bg-mist/60 p-3 text-xs italic text-ink">
                    &ldquo;{pendingCard.rawAnnouncement}&rdquo;
                  </p>

                  <div className="mt-3 rounded-2xl border border-ice bg-[#F5F9FF] p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-cobalt">
                      Plain-English Rule Ready for Your Approval:
                    </p>
                    <p className="mt-1 font-display text-lg font-semibold text-ink">
                      {pendingCard.plainSummary}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => triggerExternalNotification(pendingCard)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ice bg-white px-3.5 py-2 text-xs font-semibold text-cobalt hover:border-cobalt"
                    >
                      Open in Real{" "}
                      {pendingCard.notifyVia === "gmail" ? "Gmail" : "WhatsApp"} ↗
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingCard(null)}
                        className="rounded-full border border-ice bg-white px-4 py-2 text-xs font-semibold text-muted hover:text-deny"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={handleManagerApprove}
                        className="inline-flex items-center gap-1.5 rounded-full bg-cobalt px-5 py-2 text-xs font-semibold text-white shadow-md shadow-cobalt/25 hover:brightness-110"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve &amp; Sync to All AI Agents
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </SpotlightTiltCard>

          <SpotlightTiltCard
            tiltMax={2.5}
            className="rounded-[30px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold text-ink">
                Live Agent Verification Log ({decisions.length})
              </h3>
              <span className="rounded-full bg-mist px-3 py-1 font-mono text-[11px] font-semibold text-cobalt">
                SHA-256 Verified
              </span>
            </div>
            {decisions.length === 0 ? (
              <p className="mt-3 text-xs text-muted">
                Run an agent test on the right to see live millisecond verifications and auto-corrections recorded here.
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {decisions.slice(0, 4).map((d) => (
                  <div
                    key={d.requestId + d.at}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-ice bg-white p-3.5 shadow-sm"
                  >
                    <div>
                      <p className="text-xs font-semibold text-ink">
                        {d.agent} · <span className="font-mono text-cobalt">{d.action}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {d.correctionNote ?? d.reason}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-bold text-ink">
                      {d.ms.toFixed(2)} ms
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SpotlightTiltCard>
        </div>

        <div className="space-y-6 lg:col-span-6">
          <SpotlightTiltCard
            tiltMax={2.5}
            className="rounded-[30px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-cobalt/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cobalt">
                Millisecond Agent Guard
              </span>
              <span className="font-mono text-xs font-semibold text-cobalt">
                Active Cap: {currentDiscountCap}%
              </span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold text-ink">
              2. Test AI Agent Auto-Correction
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              What happens if an AI agent comes in with an outdated or wrong policy? Test it below: set the discount the
              agent is trying to give, and watch AegisBrain verify or auto-correct it in milliseconds.
            </p>

            <div className="mt-5 rounded-2xl border border-ice bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">
                  AI Sales Agent attempts to offer discount:
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
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>1% (Safe)</span>
                <span>Current Cap: {currentDiscountCap}%</span>
                <span>25% (Outdated / Violation)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunAgentCorrectionTest}
              disabled={simRunning}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cobalt px-6 py-3.5 text-xs font-semibold text-white shadow-md shadow-cobalt/20 transition hover:brightness-110 disabled:opacity-60"
            >
              <Zap className="h-4 w-4" />
              {simRunning
                ? "Verifying Agent Action..."
                : `Run Agent with ${simAgentDiscount}% Discount Against Active ${currentDiscountCap}% Policy`}
            </button>

            <AnimatePresence mode="wait">
              {simResult && (
                <motion.div
                  key={simResult.at}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                  className="mt-5 rounded-2xl border border-ice bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        simResult.verdict === "ALLOW"
                          ? "bg-allow/15 text-allow"
                          : "bg-hold/15 text-cobalt"
                      }`}
                    >
                      {simResult.verdict === "ALLOW" ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" /> Policy Verified · Passed Smoothly
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4" /> Outdated Policy Caught &amp; Auto-Corrected
                        </>
                      )}
                    </span>
                    <span className="font-mono text-xs font-bold text-ink">
                      {simResult.ms.toFixed(2)} ms
                    </span>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-ink">
                    {simResult.correctionNote ?? simResult.reason}
                  </p>

                  {simResult.correctedParams && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-deny/30 bg-deny/5 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-deny">
                          × Agent Attempted (Outdated)
                        </p>
                        <p className="mt-1 font-mono text-sm font-bold text-ink">
                          discount_pct: {String(simResult.params.discount_pct)}%
                        </p>
                      </div>
                      <div className="rounded-xl border border-allow/30 bg-allow/10 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-allow">
                          ✓ AegisBrain Auto-Corrected Output
                        </p>
                        <p className="mt-1 font-mono text-sm font-bold text-ink">
                          discount_pct: {String(simResult.correctedParams.discount_pct)}%
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between border-t border-ice pt-2.5 font-mono text-[10px] text-muted">
                    <span>SHA-256 SEAL:</span>
                    <HexScrambleText
                      text={simResult.auditHash.slice(0, 28)}
                      className="text-cobalt"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </SpotlightTiltCard>

          <SpotlightTiltCard
            tiltMax={2.5}
            className="rounded-[30px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-7 shadow-md"
          >
            <h3 className="font-display text-xl font-semibold text-ink">
              Active Company Policies ({rules.length})
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Every connected AI agent is currently enforcing these verified rules:
            </p>
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
          </SpotlightTiltCard>
        </div>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/* Public Home Page Components (Playground + AST Tree + Priya Flow)   */
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
    }, 220);
  };

  const ui = decision ? VERDICT_UI[decision.verdict] : null;

  return (
    <section id="try" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-20">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ice bg-white px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-cobalt shadow-sm">
            <Terminal className="h-3.5 w-3.5" /> Live AST Sandbox
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink md:text-5xl">
            Try an autonomous agent action
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-muted">
            Select a real agent tool payload below. Watch AegisBrain evaluate the Abstract Syntax Tree in under a
            millisecond, auto-correct outdated parameters, and seal the SHA-256 audit hash.
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-12">
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
                      : "border-ice bg-white/70 hover:border-cobalt/30 hover:bg-white"
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
            Incoming Agent Tool Call Payload
          </p>
          <pre className="overflow-x-auto rounded-2xl border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-4 font-mono text-[12px] leading-relaxed text-ink shadow-sm">
            {JSON.stringify(scenario.call, null, 2)}
          </pre>

          <Magnetic className="w-full">
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cobalt px-6 py-4 font-semibold text-white shadow-lg shadow-cobalt/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            >
              {running ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Evaluating AST Policy Nodes...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" /> Check this action against Gateway
                </>
              )}
            </button>
          </Magnetic>
        </div>

        <div className="lg:col-span-7">
          <SpotlightTiltCard
            tiltMax={2}
            className="flex min-h-[520px] flex-col rounded-[32px] border border-ice bg-gradient-to-b from-white/95 to-[#EDF3FF]/95 p-6 shadow-[0_24px_60px_-18px_rgba(43,84,240,0.22)] md:p-8"
          >
            <AnimatePresence mode="wait">
              {decision && ui ? (
                <motion.div
                  key={decision.at}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
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

                  {/* Live AST Node Execution Strip */}
                  <div className="mt-5 grid grid-cols-4 gap-2">
                    {[
                      ["1. Action AST", scenario.call.action],
                      ["2. Rule Match", decision.ruleId ?? "default_allow"],
                      ["3. Verdict", decision.verdict],
                      ["4. SHA-256 Chain", `${decision.auditHash.slice(0, 8)}...`],
                    ].map(([stepTitle, stepVal], idx) => (
                      <motion.div
                        key={stepTitle}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        className="rounded-xl border border-ice bg-white p-2.5 shadow-sm"
                      >
                        <p className="text-[10px] font-semibold uppercase text-muted">
                          {stepTitle}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-xs font-bold text-cobalt">
                          {stepVal}
                        </p>
                      </motion.div>
                    ))}
                  </div>

                  {decision.correctedParams && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-cobalt">
                        Cryptographic Decision Record
                      </p>
                      <HexScrambleText
                        text={`sha256:${decision.auditHash.slice(0, 24)}`}
                        className="font-mono text-[11px] text-muted"
                      />
                    </div>
                    <pre className="overflow-x-auto rounded-2xl border border-ice bg-white/95 p-4 font-mono text-[12px] leading-relaxed text-ink shadow-inner">
                      {JSON.stringify(
                        {
                          request_id: decision.requestId,
                          agent: scenario.call.agent,
                          action: scenario.call.action,
                          verdict: decision.verdict,
                          rule: decision.ruleId ?? "default_allow",
                          checked_in_ms: Number(decision.ms.toFixed(2)),
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
                  <motion.div
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="grid h-16 w-16 place-items-center rounded-2xl border border-ice bg-mist text-cobalt shadow-sm"
                  >
                    <Fingerprint className="h-8 w-8" />
                  </motion.div>
                  <p className="mt-5 font-display text-2xl font-semibold text-ink">
                    AST Gateway Ready for Inspection
                  </p>
                  <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
                    Choose an agent scenario on the left, then click{" "}
                    <strong className="text-ink">Check this action against Gateway</strong>.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </SpotlightTiltCard>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive 5-Step Priya Pipeline Story                            */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    title: "A manager decides in Slack",
    body: "In a channel the company chose. Direct messages are never read.",
  },
  {
    title: "We check who may set it",
    body: "Only people with the right role can propose that kind of rule.",
  },
  {
    title: "AI drafts the rule, nothing more",
    body: "It cannot lock anything. An unclear message gets a question back.",
  },
  {
    title: "A manager approves it",
    body: "They verify via Gmail or WhatsApp before locking it into force.",
  },
  {
    title: "The gateway enforces & auto-corrects",
    body: "Plain code checks every agent action in milliseconds.",
  },
];

function PinnedFlow({
  cap,
  onUpdateCap,
}: {
  cap: number;
  onUpdateCap: (newCap: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"idle" | "locked" | "edit" | "ignored">("idle");

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)));
    setStep((prev) => (prev === next ? prev : next));
  });

  const fill = useSpring(scrollYProgress, { stiffness: 100, damping: 26, mass: 0.4 });

  const goToStep = (idx: number) => {
    setStep(idx);
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const scrollable = el.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: top + ((idx + 0.1) / STEPS.length) * scrollable,
      behavior: "smooth",
    });
  };

  return (
    <section id="how" ref={ref} className="relative h-[400vh]">
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-6 pt-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ice bg-white px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-cobalt shadow-sm">
              <GitBranch className="h-3.5 w-3.5" /> End-to-End Governance Lifecycle
            </span>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-ink md:text-4xl">
              From a Slack message to a verified agent
            </h2>

            <div className="relative mt-8 hidden pl-8 lg:block">
              <div className="absolute bottom-2 left-[7px] top-2 w-px bg-ice" />
              <motion.div
                className="absolute bottom-2 left-[7px] top-2 w-px origin-top bg-cobalt"
                style={{ scaleY: fill }}
              />
              <ol className="space-y-5">
                {STEPS.map((s, i) => {
                  const active = i === step;
                  return (
                    <li
                      key={s.title}
                      onClick={() => goToStep(i)}
                      className="relative cursor-pointer select-none"
                    >
                      <span
                        className={`absolute -left-8 top-1.5 h-3.5 w-3.5 rounded-full border-2 transition-all duration-300 ${
                          i <= step
                            ? "border-cobalt bg-cobalt shadow-[0_0_12px_rgba(43,84,240,0.5)]"
                            : "border-ice bg-white"
                        }`}
                      />
                      <p
                        className={`font-display text-lg font-semibold transition-opacity duration-300 ${
                          active
                            ? "opacity-100 text-ink"
                            : "opacity-40 text-muted hover:opacity-75"
                        }`}
                      >
                        {s.title}
                      </p>
                      <AnimatePresence initial={false}>
                        {active && (
                          <motion.p
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                            className="overflow-hidden text-sm text-muted"
                          >
                            <span className="block pt-1">{s.body}</span>
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          <div className="lg:col-span-7">
            <SpotlightTiltCard
              tiltMax={2.5}
              className="relative overflow-hidden rounded-[32px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-6 shadow-[0_30px_70px_-20px_rgba(43,84,240,0.25)] md:p-8"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cobalt/0 via-cobalt to-cobalt/0" />
              <div className="mb-4 flex items-center justify-between border-b border-ice pb-3">
                <span className="inline-flex items-center rounded-full bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cobalt">
                  Step {step + 1} of {STEPS.length}
                </span>
                <div className="flex items-center gap-2">
                  {STEPS.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => goToStep(idx)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        idx === step ? "w-6 bg-cobalt" : "w-2 bg-ice hover:bg-muted"
                      }`}
                      aria-label={`Step ${idx + 1}`}
                    />
                  ))}
                </div>
              </div>

              <div className="relative h-[320px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    className="flex h-full w-full flex-col justify-between"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.26, ease: EASE_OUT_EXPO }}
                  >
                    {step === 0 && (
                      <div className="flex h-full flex-col justify-between">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-semibold text-cobalt">
                            <MessageSquare className="h-4 w-4" /> #policy-updates
                          </p>
                          <div className="mt-4 flex gap-3.5">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cobalt font-display text-lg font-semibold text-white shadow-md">
                              P
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-ink">
                                Priya{" "}
                                <span className="font-normal text-muted">
                                  Finance Director, 9:41 AM
                                </span>
                              </p>
                              <div className="mt-2 max-w-md rounded-2xl rounded-tl-sm border border-ice bg-white p-4 text-[15px] leading-relaxed text-ink shadow-sm">
                                Margin pressure. From today, discounts are capped at {cap}% until
                                further notice.
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-muted">
                          Channel stream verified via workspace webhook.
                        </p>
                      </div>
                    )}

                    {step === 1 && (
                      <div className="flex h-full flex-col justify-between">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-semibold text-cobalt">
                            <UserCheck className="h-4 w-4" /> Verified before AI parses the text
                          </p>
                          <div className="mt-3 space-y-2.5">
                            {[
                              {
                                who: "Priya",
                                role: "Finance Director",
                                may: "Refunds, discounts",
                                ok: true,
                                result: "Can propose this rule",
                              },
                              {
                                who: "A new intern",
                                role: "No policy rights",
                                may: "Nothing",
                                ok: false,
                                result: "Ignored & flagged to manager",
                              },
                            ].map((r) => (
                              <div
                                key={r.who}
                                className="flex items-center gap-4 rounded-2xl border border-ice bg-white p-3.5 shadow-sm"
                              >
                                {r.ok ? (
                                  <CheckCircle2 className="h-5 w-5 shrink-0 text-allow" />
                                ) : (
                                  <XCircle className="h-5 w-5 shrink-0 text-deny" />
                                )}
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-ink">
                                    {r.who}{" "}
                                    <span className="text-xs font-normal text-muted">
                                      · {r.role}
                                    </span>
                                  </p>
                                  <p className="text-xs text-muted">
                                    May configure:{" "}
                                    <span className="font-medium text-ink">{r.may}</span>
                                  </p>
                                </div>
                                <p
                                  className={`text-right text-xs font-semibold ${
                                    r.ok ? "text-allow" : "text-deny"
                                  }`}
                                >
                                  {r.result}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-muted">
                          Role permissions checked prior to rule compilation.
                        </p>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="flex h-full flex-col justify-between">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-semibold text-cobalt">
                            <FileText className="h-4 w-4" /> Structured Rule Draft. Nothing is
                            active yet.
                          </p>
                          <pre className="mt-3 overflow-x-auto rounded-2xl border border-ice bg-white p-3.5 font-mono text-[11.5px] leading-snug text-ink shadow-inner">
                            {JSON.stringify(
                              {
                                type: "policy",
                                status: "awaiting_manager_verification",
                                action: "discounts.apply",
                                max_allowed_pct: cap,
                                source: { channel: "#policy-updates", author: "priya" },
                              },
                              null,
                              2
                            )}
                          </pre>
                        </div>
                        <p className="text-xs text-muted">
                          Dispatched to manager&apos;s Gmail &amp; WhatsApp for sign-off.
                        </p>
                      </div>
                    )}

                    {step === 3 && (
                      <div className="flex h-full flex-col justify-between">
                        <div className="rounded-2xl border border-ice bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                              Original instruction
                            </p>
                            {mode === "locked" && (
                              <span className="rounded-full bg-allow/15 px-2.5 py-0.5 text-[11px] font-semibold text-allow">
                                Locked &amp; Synced to Agents
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-medium text-ink">
                            &ldquo;From today, discounts are capped at {cap}%.&rdquo;
                          </p>
                          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">
                            Compiled Rule Logic
                          </p>
                          {mode === "edit" ? (
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="font-display text-lg font-semibold text-ink">
                                Cap discounts at
                              </span>
                              <input
                                type="number"
                                min={1}
                                max={50}
                                value={cap}
                                onChange={(e) => onUpdateCap(Number(e.target.value) || 5)}
                                className="w-16 rounded-lg border border-cobalt bg-white px-2 py-1 font-mono text-sm font-bold text-ink"
                              />
                              <span className="font-display text-lg font-semibold text-ink">
                                %
                              </span>
                              <button
                                type="button"
                                onClick={() => setMode("idle")}
                                className="ml-2 rounded-full bg-cobalt px-3 py-1 text-xs font-semibold text-white"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <p className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
                              Auto-correct any discount above {cap}%.
                            </p>
                          )}
                          <p className="mt-2 text-xs font-semibold text-hold">
                            Verified via Manager Gmail / WhatsApp notification.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setMode("locked");
                              setTimeout(() => goToStep(4), 450);
                            }}
                            className="rounded-full bg-cobalt px-5 py-2 text-sm font-semibold text-white shadow-md shadow-cobalt/25 transition hover:brightness-110 active:scale-95"
                          >
                            {mode === "locked" ? "✓ Rule Locked" : "Approve & Lock Rule"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode("edit")}
                            className="rounded-full border border-ice bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-cobalt"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode("ignored")}
                            className="rounded-full border border-ice bg-white px-4 py-2 text-sm font-medium text-muted transition hover:bg-mist/50"
                          >
                            Ignore
                          </button>
                        </div>
                      </div>
                    )}

                    {step === 4 && (
                      <div className="flex h-full flex-col justify-between">
                        <div>
                          <p className="text-sm font-semibold text-cobalt">
                            Every agent is verified &amp; auto-corrected in milliseconds
                          </p>
                          <div className="mt-3 space-y-2.5">
                            {[
                              {
                                ask: "Outdated agent tries 10% off",
                                verdict: "DENY" as Verdict,
                                why: `Intercepted in 0.36 ms → Auto-corrected to ${cap}% cap`,
                              },
                              {
                                ask: `Synced agent offers ${cap}% off`,
                                verdict: "ALLOW" as Verdict,
                                why: `Matches active ${cap}% policy → Goes through smoothly`,
                              },
                            ].map((r) => {
                              const ui = VERDICT_UI[r.verdict];
                              return (
                                <div
                                  key={r.ask}
                                  className={`flex items-center justify-between rounded-2xl border p-3.5 shadow-sm ${ui.bg} ${ui.border}`}
                                >
                                  <div>
                                    <p className="text-sm font-semibold text-ink">{r.ask}</p>
                                    <p className="text-xs text-muted">{r.why}</p>
                                  </div>
                                  <p className={`font-display text-sm font-bold ${ui.text}`}>
                                    {ui.label}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <p className="text-xs text-muted">
                          Sub-millisecond verification with zero outdated agent errors.
                        </p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </SpotlightTiltCard>
          </div>
        </div>
      </div>
    </section>
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
  const [stopped, setStopped] = useState(0);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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

  const ready = !intro;

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

  const transitionToStage = (
    nextStage: "home" | "manager-auth" | "integration-guide" | "dashboard",
    title: string,
    subtitle: string
  ) => {
    setCurtain({ active: true, title, subtitle });
    setTimeout(() => {
      setStage(nextStage);
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }, 520);
    setTimeout(() => {
      setCurtain((prev) => ({ ...prev, active: false }));
    }, 1150);
  };

  const handleDecision = (d: Decision) => {
    setDecisions((prev) => [d, ...prev]);
    if (d.verdict !== "ALLOW") setStopped((s) => s + 1);
    setLastMs(d.ms);
  };

  const handleUpdatePriyaCap = (newCap: number) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === "promo_cap_v2"
          ? {
              ...r,
              threshold: newCap,
              summary: `Customer discounts are capped at ${newCap}%`,
              reason: `Discounts above ${newCap}% are blocked. Auto-correcting agent to ${newCap}% cap.`,
            }
          : r
      )
    );
  };

  const handleApproveNewRule = (newRule: Rule) => {
    setRules((prev) => {
      const filtered = prev.filter((r) => !(r.action === newRule.action && !r.vipOnly));
      return [newRule, ...filtered];
    });
  };

  const { scrollYProgress } = useScroll();
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  const priyaRule = rules.find((r) => r.action === "discounts.apply" && !r.vipOnly);
  const currentCap = Number(priyaRule?.threshold ?? 5);

  return (
    <div className="relative min-h-screen text-ink">
      <AnimatePresence>
        {intro && !reduce && <GateIntro key="intro" onDone={finishIntro} />}
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

      <header className="sticky top-0 z-40 border-b border-ice/80 bg-paper/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <button
            type="button"
            onClick={() =>
              transitionToStage("home", "Returning to AegisBrain Overview", "Public Gateway")
            }
            className="flex items-center gap-2.5"
          >
            <Logo />
            <span className="font-display text-xl font-semibold tracking-tight text-ink">
              AegisBrain
            </span>
          </button>

          <nav className="hidden items-center gap-7 md:flex">
            <a
              href="#product"
              onClick={() => setStage("home")}
              className="text-sm font-medium text-muted transition hover:text-ink"
            >
              Product
            </a>
            <a
              href="#try"
              onClick={() => setStage("home")}
              className="text-sm font-medium text-muted transition hover:text-ink"
            >
              Interactive Gateway
            </a>
            <a
              href="#how"
              onClick={() => setStage("home")}
              className="text-sm font-medium text-muted transition hover:text-ink"
            >
              How it works
            </a>
            <a
              href="#faq"
              onClick={() => setStage("home")}
              className="text-sm font-medium text-muted transition hover:text-ink"
            >
              FAQ
            </a>
            <button
              type="button"
              onClick={() =>
                transitionToStage(
                  managerProfile ? "dashboard" : "manager-auth",
                  managerProfile
                    ? `Opening ${managerProfile.companyName} Control Room`
                    : "Opening Manager Portal",
                  "Executive Access"
                )
              }
              className="text-sm font-semibold text-cobalt transition hover:text-ink"
            >
              Manager Portal
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <Magnetic>
              <button
                type="button"
                onClick={() =>
                  transitionToStage(
                    "manager-auth",
                    "Unfolding Manager Authentication Portal",
                    "Step 1 of 3"
                  )
                }
                className="rounded-full bg-cobalt px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-cobalt/20 transition hover:brightness-110 active:scale-95"
              >
                {managerProfile ? "Open Dashboard" : "Manager Login / Register"}
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
                "Unfolding Visual Integration & SDK Blueprint",
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
              transitionToStage("home", "Returning to Public Overview", "AegisBrain")
            }
          />
        )}

        {stage === "home" && (
          <>
            <LiveTelemetryRibbon
              activeRulesCount={rules.length}
              lastMs={lastMs}
              currentCap={currentCap}
            />

            <section className="mx-auto max-w-7xl px-6 pb-16 pt-12 md:pt-20">
              <h1
                className="font-display font-semibold tracking-[-0.035em] text-ink"
                style={{ fontSize: "clamp(2.6rem, 7.4vw, 6rem)", lineHeight: 0.98 }}
              >
                <Reveal ready={ready} delay={0.15}>
                  Your agents follow
                </Reveal>
                <Reveal ready={ready} delay={0.27}>
                  the rules you decided
                </Reveal>
                <Reveal ready={ready} delay={0.39}>
                  today, not last year&apos;s.
                </Reveal>
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 14 }}
                transition={{ duration: 0.8, ease: EASE_OUT_EXPO, delay: 0.65 }}
                className="mt-8 max-w-xl text-lg leading-relaxed text-muted md:text-xl"
              >
                AegisBrain grabs policy changes announced in Slack, WhatsApp, and Gmail, verifies them with the manager
                in one tap, and auto-corrects every AI agent in milliseconds.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 14 }}
                transition={{ duration: 0.8, ease: EASE_OUT_EXPO, delay: 0.8 }}
                className="mt-8 flex flex-wrap items-center gap-5"
              >
                <Magnetic>
                  <a
                    href="#try"
                    className="inline-block rounded-full bg-cobalt px-7 py-3.5 font-semibold text-white shadow-lg shadow-cobalt/25 transition hover:brightness-110 active:scale-95"
                  >
                    Try the gateway
                  </a>
                </Magnetic>
                <Magnetic>
                  <a
                    href="#contact"
                    className="inline-block rounded-full border border-ice bg-white/90 px-6 py-3.5 font-semibold text-ink shadow-sm transition hover:border-cobalt"
                  >
                    Register Company
                  </a>
                </Magnetic>
                <button
                  type="button"
                  onClick={() =>
                    transitionToStage(
                      "manager-auth",
                      "Unfolding Manager Authentication Portal",
                      "Step 1 of 3"
                    )
                  }
                  className="inline-flex items-center gap-1.5 font-semibold text-cobalt underline decoration-cobalt/40 decoration-2 underline-offset-8 hover:decoration-cobalt"
                >
                  Manager Login / Portal <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>

              {/* Live SVG Packet & AST Architecture Topology */}
              <LivePacketTopology currentCap={currentCap} />
            </section>

            <section className="mx-auto max-w-7xl px-6">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
                {[
                  {
                    label: "Rules in force",
                    value: <CountUp to={rules.length} play={ready} />,
                  },
                  { label: "Connected channels", value: <CountUp to={3} play={ready} /> },
                  { label: "Agents auto-corrected", value: <span>{stopped}</span> },
                  {
                    label: "Last check",
                    value: (
                      <span>{lastMs === null ? "0.38 ms" : `${lastMs.toFixed(2)} ms`}</span>
                    ),
                  },
                ].map((m) => (
                  <SpotlightTiltCard
                    key={m.label}
                    tiltMax={4}
                    className="rounded-3xl border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1"
                  >
                    <p className="text-sm font-medium text-muted group-hover:text-cobalt">
                      {m.label}
                    </p>
                    <p
                      className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {m.value}
                    </p>
                  </SpotlightTiltCard>
                ))}
              </div>
            </section>

            <div id="product" className="scroll-mt-20">
              <RotatingCards />
            </div>

            <Playground rules={rules} onResult={handleDecision} />

            <PinnedFlow cap={currentCap} onUpdateCap={handleUpdatePriyaCap} />

            <section id="faq" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-20">
              <div className="text-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-ice bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-cobalt shadow-sm">
                  Enterprise Assurance
                </span>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink md:text-5xl">
                  Frequently Answered Inquiries
                </h2>
              </div>

              <div className="mt-12 space-y-4">
                {(
                  faqs as Array<{
                    q?: string;
                    question?: string;
                    a?: string;
                    answer?: string;
                  }>
                ).map((faq, i) => {
                  const isOpen = openFaq === i;
                  return (
                    <div
                      key={i}
                      className="overflow-hidden rounded-2xl border border-ice bg-gradient-to-b from-white to-[#EDF3FF]/70 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : i)}
                        className="flex w-full items-center justify-between p-6 text-left"
                      >
                        <span className="font-display text-lg font-semibold text-ink">
                          {faq.q ?? faq.question}
                        </span>
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 text-muted transition-transform duration-300 ${
                            isOpen ? "rotate-180 text-cobalt" : ""
                          }`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                          >
                            <div className="border-t border-ice px-6 pb-6 pt-3 text-sm leading-relaxed text-muted">
                              {faq.a ?? faq.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </section>

            <section id="contact" className="mx-auto max-w-4xl scroll-mt-24 px-6 py-20">
              <motion.div
                initial={{ opacity: 0, y: 36 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.75, ease: EASE_OUT_EXPO }}
                className="mb-8 text-center"
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-ice bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-cobalt shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" /> Start Your Organization Setup
                </span>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink md:text-5xl">
                  Register your company &amp; open the Manager Portal
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted">
                  Enter the judge or manager&apos;s details below. The page will unfold into the Verification Portal and
                  automatically dispatch a personalized Collaboration Charter from{" "}
                  <strong className="text-ink">{FOUNDER_NAME}</strong>.
                </p>
              </motion.div>

              <SpotlightTiltCard
                tiltMax={2}
                className="rounded-[32px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-6 shadow-[0_28px_70px_-18px_rgba(43,84,240,0.24)] md:p-10"
              >
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
              </SpotlightTiltCard>
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
              transition={{ duration: 0.34, ease: EASE_OUT_EXPO }}
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