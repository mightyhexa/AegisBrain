"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, ShieldCheck, AlertTriangle } from "lucide-react";
import type { Workspace } from "@/lib/workspace";
import CopyButton from "./CopyButton";
import { EASE, card, codeBox } from "./styles";

const ROLE_COPY: Record<string, string> = {
  runtime: "For your AI agents. Lets them ask the gateway before they act.",
  policy_reader: "Read-only access to rules and decisions.",
  policy_admin: "For the people who review and approve rules.",
  tenant_admin: "Full control of this workspace. Keep it private.",
};

function mask(k: string) {
  const dot = k.indexOf(".");
  return (dot > 0 ? k.slice(0, dot + 1) : k.slice(0, 8)) + "\u2022".repeat(24);
}

const list = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };
const item = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
};

function KeyRow({ role, keyId, scopes, apiKey }: { role: string; keyId: string; scopes: string[]; apiKey: string }) {
  const [shown, setShown] = useState(false);
  return (
    <motion.li variants={item} className={`${card} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-xl font-semibold capitalize tracking-tight">{role.replace("_", " ")}</p>
          <p className="text-sm text-muted">{ROLE_COPY[role] ?? "Scoped access key."}</p>
        </div>
        <p className="font-mono text-xs text-muted">{keyId}</p>
      </div>
      <div className={`${codeBox} mt-4 flex items-center justify-between gap-3 px-4 py-3 text-[13px]`}>
        <span className="min-w-0 break-all">{shown ? apiKey : mask(apiKey)}</span>
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide key" : "Show key"}
            className="grid h-9 w-9 place-items-center rounded-full border border-ice bg-white/85 transition hover:bg-white"
          >
            {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <CopyButton text={apiKey} />
        </span>
      </div>
      {scopes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {scopes.map((s) => (
            <span key={s} className="rounded-full border border-ice bg-mist px-3 py-1 font-mono text-[11px]">
              {s}
            </span>
          ))}
        </div>
      )}
    </motion.li>
  );
}

export default function KeysTab({ ws }: { ws: Workspace }) {
  return (
    <div className="space-y-6">
      <div className={`${card} flex flex-wrap items-center gap-4 p-5`}>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cobalt/10 text-cobalt">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold tracking-tight">Terms and data agreement accepted</p>
          <p className="text-sm text-muted">
            {ws.contact} accepted the Terms of Service and the Data Processing Agreement on{" "}
            {new Date(ws.acceptedAt).toLocaleString()}.
          </p>
        </div>
        {typeof ws.seededPolicies === "number" && (
          <span className="rounded-full border border-ice bg-mist px-4 py-1.5 text-sm">
            {ws.seededPolicies} starter rules added
          </span>
        )}
      </div>

      {ws.credentials.length === 0 ? (
        <div className={`${card} p-6 text-lg text-muted`}>
          {ws.mode === "demo"
            ? "This is the demo workspace. It has no keys; it only works against a gateway running in local development mode."
            : "No keys were returned for this workspace."}
        </div>
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-2xl border border-hold/30 bg-hold/10 px-4 py-3 text-[15px]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-hold" />
            Save these keys now. We do not store them in your browser, so they disappear when you refresh this page.
          </p>
          <motion.ul variants={list} initial="hidden" animate="show" className="space-y-4">
            {ws.credentials.map((c) => (
              <KeyRow key={c.key_id} role={c.role} keyId={c.key_id} scopes={c.scopes ?? []} apiKey={c.api_key} />
            ))}
          </motion.ul>
        </>
      )}
    </div>
  );
}
