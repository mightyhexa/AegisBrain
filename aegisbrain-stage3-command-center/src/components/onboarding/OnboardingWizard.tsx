"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil } from "lucide-react";
import { ApiError, registerCompany, type RegisterRequest } from "@/lib/api";
import { workspace } from "@/lib/workspace";
import { EASE, btnGhost, btnPrimary, card, field } from "@/components/app/styles";

const STEPS = ["Your company", "Your agents", "Review and accept"];
const FRAMEWORKS = ["LangChain", "OpenAI Agents SDK", "Custom REST agents", "Other"];
const VOLUMES = ["Under 10k", "10k - 100k", "100k - 500k", "500k +"];
const USE_CASES = ["Refund and promo governance", "Access and permissions", "Data changes", "Other"];
const STAGES = ["Creating your private workspace", "Adding the starter rules", "Creating your access keys", "Opening your command center"];

type Form = RegisterRequest;
const EMPTY: Form = {
  company_name: "",
  contact_name: "",
  work_email: "",
  role_title: "",
  agent_framework: "",
  monthly_action_volume: "",
  primary_use_case: "",
};

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "AB";
}

function Chips({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          aria-pressed={value === o}
          className={`rounded-full border px-4 py-2 text-sm transition ${
            value === o ? "border-cobalt bg-cobalt text-white" : "border-ice bg-white/80 hover:bg-white"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [f, setF] = useState<Form>(EMPTY);
  const [terms, setTerms] = useState(false);
  const [dpa, setDpa] = useState(false);
  const [auth, setAuth] = useState(false);
  const [phase, setPhase] = useState<"form" | "working" | "error">("form");
  const [stage, setStage] = useState(0);
  const [err, setErr] = useState("");
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const go = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current);
      if (go.current) clearTimeout(go.current);
    },
    []
  );

  const set = (k: keyof Form) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const input = (k: keyof Form) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value),
  });

  const valid =
    step === 0
      ? f.company_name.trim().length > 1 && f.contact_name.trim().length > 1 && emailOk(f.work_email) && f.role_title.trim().length > 1
      : step === 1
      ? !!f.agent_framework && !!f.monthly_action_volume && !!f.primary_use_case
      : terms && dpa && auth;

  const move = (d: number) => {
    setDir(d);
    setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + d)));
  };

  async function submit() {
    setPhase("working");
    setStage(0);
    setErr("");
    tick.current = setInterval(() => setStage((s) => Math.min(s + 1, 2)), 950);
    try {
      const { data } = await registerCompany({ ...f, company_name: f.company_name.trim(), contact_name: f.contact_name.trim() });
      if (tick.current) clearInterval(tick.current);
      setStage(3);
      const seeded = Array.isArray(data.baseline_policies_seeded)
        ? data.baseline_policies_seeded.length
        : typeof data.baseline_policies_seeded === "number"
        ? data.baseline_policies_seeded
        : undefined;
      workspace.set({
        mode: "registered",
        company: f.company_name.trim(),
        contact: f.contact_name.trim(),
        email: f.work_email.trim(),
        registrationId: data.registration_id,
        tenantId: data.tenant_id,
        seededPolicies: seeded,
        credentials: Array.isArray(data.credentials) ? data.credentials : [],
        acceptedAt: new Date().toISOString(),
      });
      go.current = setTimeout(() => router.push("/app"), 1500);
    } catch (e) {
      if (tick.current) clearInterval(tick.current);
      setErr(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      setPhase("error");
    }
  }

  const slide = {
    initial: (d: number) => ({ opacity: 0, x: d * 48 }),
    animate: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -48 }),
  };

  const progress = (stage + 1) / STAGES.length;

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Left: progress rail and live preview */}
      <aside className="space-y-6 lg:col-span-4">
        <ol className="relative space-y-6 pl-10">
          <div className="absolute bottom-2 left-[15px] top-2 w-px bg-ice" aria-hidden="true" />
          <motion.div
            className="absolute left-[15px] top-2 w-px origin-top bg-cobalt"
            style={{ height: "calc(100% - 1rem)" }}
            animate={{ scaleY: step / (STEPS.length - 1) }}
            transition={{ duration: 0.7, ease: EASE }}
            aria-hidden="true"
          />
          {STEPS.map((s, i) => (
            <li key={s} className="relative">
              <motion.span
                animate={{ scale: i === step ? 1.12 : 1 }}
                className={`absolute -left-10 top-0 grid h-8 w-8 place-items-center rounded-full border text-sm font-semibold transition-colors ${
                  i < step ? "border-cobalt bg-cobalt text-white" : i === step ? "border-cobalt bg-white text-cobalt" : "border-ice bg-paper text-muted"
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </motion.span>
              <p className={`font-display text-lg font-semibold tracking-tight ${i === step ? "text-ink" : "text-muted"}`}>{s}</p>
            </li>
          ))}
        </ol>

        <div className={`${card} p-6`}>
          <div className="flex items-center gap-4">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={initials(f.company_name)}
                initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
                className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cobalt to-[#7C9BFF] font-display text-xl font-semibold text-white"
              >
                {initials(f.company_name)}
              </motion.span>
            </AnimatePresence>
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-semibold tracking-tight">{f.company_name || "Your company"}</p>
              <p className="truncate text-sm text-muted">{f.contact_name || "Your name"}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-ice bg-mist px-3 py-1">Pilot</span>
            <span className="rounded-full border border-ice bg-mist px-3 py-1">Starts in shadow mode</span>
            {f.agent_framework && <span className="rounded-full border border-cobalt/30 bg-cobalt/10 px-3 py-1 text-cobalt">{f.agent_framework}</span>}
            {f.monthly_action_volume && <span className="rounded-full border border-ice bg-white px-3 py-1">{f.monthly_action_volume} actions / month</span>}
          </div>
          <p className="mt-5 text-sm text-muted">Nothing is blocked until you choose to switch enforcement on.</p>
        </div>
      </aside>

      {/* Right: the form */}
      <div className={`${card} p-6 md:p-10 lg:col-span-8`} style={{ minHeight: 520 }}>
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} custom={dir} variants={slide} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.4, ease: EASE }}>
            {step === 0 && (
              <div className="space-y-5">
                <h2 className="font-display text-3xl font-semibold tracking-tight">Tell us about your company</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Company name
                    <input {...input("company_name")} className={field} autoComplete="organization" maxLength={120} />
                  </label>
                  <label className="block text-sm font-medium">
                    Your name
                    <input {...input("contact_name")} className={field} autoComplete="name" maxLength={120} />
                  </label>
                  <label className="block text-sm font-medium">
                    Work email
                    <input {...input("work_email")} type="email" className={field} autoComplete="email" maxLength={200} />
                  </label>
                  <label className="block text-sm font-medium">
                    Your role
                    <input {...input("role_title")} className={field} autoComplete="organization-title" maxLength={120} />
                  </label>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-7">
                <h2 className="font-display text-3xl font-semibold tracking-tight">How do your agents work?</h2>
                <div>
                  <p className="text-sm font-medium">What do your agents run on?</p>
                  <Chips options={FRAMEWORKS} value={f.agent_framework} onPick={set("agent_framework")} />
                </div>
                <div>
                  <p className="text-sm font-medium">Actions per month, roughly</p>
                  <Chips options={VOLUMES} value={f.monthly_action_volume} onPick={set("monthly_action_volume")} />
                </div>
                <div>
                  <p className="text-sm font-medium">What do you want to keep under control?</p>
                  <Chips options={USE_CASES} value={f.primary_use_case} onPick={set("primary_use_case")} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <h2 className="font-display text-3xl font-semibold tracking-tight">Check and accept</h2>
                <dl className="divide-y divide-ice rounded-2xl border border-ice bg-white/70">
                  {[
                    ["Company", f.company_name, 0],
                    ["Contact", `${f.contact_name}, ${f.role_title}`, 0],
                    ["Email", f.work_email, 0],
                    ["Agents", `${f.agent_framework}, ${f.monthly_action_volume} a month`, 1],
                    ["Goal", f.primary_use_case, 1],
                  ].map(([k, v, s]) => (
                    <div key={String(k)} className="flex items-center justify-between gap-4 px-4 py-3 text-[15px]">
                      <dt className="w-24 shrink-0 text-muted">{k}</dt>
                      <dd className="min-w-0 flex-1 truncate">{v}</dd>
                      <button
                        type="button"
                        onClick={() => {
                          setDir(-1);
                          setStep(Number(s));
                        }}
                        aria-label={`Edit ${k}`}
                        className="text-muted transition hover:text-cobalt"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </dl>

                <div className="space-y-3 text-[15px]">
                  {[
                    [terms, setTerms, <>I accept the <Link href="/legal/terms" target="_blank" className="text-cobalt underline">Terms of Service</Link>.</>],
                    [dpa, setDpa, <>I accept the <Link href="/legal/dpa" target="_blank" className="text-cobalt underline">Data Processing Agreement</Link> and have read the <Link href="/legal/privacy" target="_blank" className="text-cobalt underline">Privacy Policy</Link>.</>],
                    [auth, setAuth, <>I am allowed to enter into this agreement for my company.</>],
                  ].map(([val, setter, label], i) => (
                    <label key={i} className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={val as boolean}
                        onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
                        className="mt-1 h-4 w-4 accent-[#2B54F0]"
                      />
                      <span>{label as React.ReactNode}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex items-center justify-between">
          <button type="button" onClick={() => move(-1)} disabled={step === 0} className={btnGhost}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => move(1)} disabled={!valid} className={btnPrimary}>
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!valid || phase === "working"} className={btnPrimary}>
              Create my workspace
            </button>
          )}
        </div>
      </div>

      {/* Provisioning overlay */}
      <AnimatePresence>
        {phase !== "form" && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[90] grid place-items-center bg-paper/75 px-6 backdrop-blur-xl"
            role="status"
            aria-live="polite"
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: EASE }}
              className={`${card} w-full max-w-md p-8 text-center`}
            >
              <div className="relative mx-auto h-28 w-28">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="#D3E1FB" strokeWidth="6" />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke={phase === "error" ? "#D42B4D" : "#2B54F0"}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={276.5}
                    animate={{ strokeDashoffset: 276.5 * (1 - (phase === "error" ? 1 : progress)) }}
                    transition={{ duration: 0.8, ease: EASE }}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center">
                  {phase === "working" && stage < 3 ? (
                    <Loader2 className="h-7 w-7 animate-spin text-cobalt" />
                  ) : phase === "error" ? (
                    <span className="font-display text-3xl text-deny">!</span>
                  ) : (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 18 }}>
                      <Check className="h-9 w-9 text-allow" />
                    </motion.span>
                  )}
                </div>
              </div>

              {phase === "error" ? (
                <>
                  <p className="mt-6 font-display text-2xl font-semibold">We could not finish</p>
                  <p className="mt-2 text-[15px] text-muted">{err}</p>
                  <button onClick={() => setPhase("form")} className={`${btnPrimary} mt-6`}>
                    Back to review
                  </button>
                </>
              ) : (
                <ul className="mt-6 space-y-3 text-left">
                  {STAGES.map((s, i) => (
                    <li key={s} className={`flex items-center gap-3 text-[15px] transition-opacity ${i <= stage ? "opacity-100" : "opacity-35"}`}>
                      <span className={`grid h-6 w-6 place-items-center rounded-full ${i < stage || stage === 3 ? "bg-allow text-white" : "border border-ice bg-white"}`}>
                        {(i < stage || stage === 3) && <Check className="h-3.5 w-3.5" />}
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
