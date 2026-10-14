"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, KeyRound, LogOut, MessagesSquare, Plug } from "lucide-react";
import { demoWorkspace, useWorkspace, workspace } from "@/lib/workspace";
import KeysTab from "./KeysTab";
import ChannelsTab from "./ChannelsTab";
import ConnectTab from "./ConnectTab";
import TelemetryTab from "./TelemetryTab";
import { EASE, btnGhost, btnPrimary, card } from "./styles";

type TabId = "keys" | "channels" | "connect" | "telemetry";

const TABS: { id: TabId; label: string; icon: typeof KeyRound }[] = [
  { id: "keys", label: "Keys and terms", icon: KeyRound },
  { id: "channels", label: "Manager channels", icon: MessagesSquare },
  { id: "connect", label: "Connect agents", icon: Plug },
  { id: "telemetry", label: "Live telemetry", icon: Activity },
];

export default function CommandCenter() {
  const ws = useWorkspace();
  const [tab, setTab] = useState<TabId>("keys");

  if (!ws) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className={`${card} mx-auto max-w-2xl p-8 text-center md:p-12`}
      >
        <p className="font-display text-3xl font-semibold tracking-tight">No workspace open in this tab</p>
        <p className="mt-3 text-lg text-muted">
          For your safety we keep keys in memory only, so a refresh closes the workspace. Register to open a new one.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/onboarding" className={btnPrimary}>
            Register your company
          </Link>
          <button onClick={() => workspace.set(demoWorkspace())} className={btnGhost}>
            Open the demo workspace
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <p className="text-sm font-medium text-cobalt">
            {ws.mode === "demo" ? "Demo workspace" : "Command center"}
            {ws.tenantId && <span className="ml-2 font-mono text-xs text-muted">{ws.tenantId}</span>}
          </p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.03em] md:text-5xl">
            {ws.mode === "demo" ? "Welcome" : `Welcome, ${ws.company}`}
          </h1>
        </div>
        <button onClick={() => workspace.clear()} className={btnGhost}>
          <LogOut className="h-4 w-4" /> Close workspace
        </button>
      </motion.div>

      <div className="relative mt-8 inline-flex max-w-full flex-wrap gap-1 rounded-full border border-ice bg-white/70 p-1 backdrop-blur-md" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`relative z-10 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                active ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_6px_20px_-6px_rgba(43,84,240,0.35)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8" style={{ perspective: 1400 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 26, rotateX: -5 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            exit={{ opacity: 0, y: -16, rotateX: 4 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {tab === "keys" && <KeysTab ws={ws} />}
            {tab === "channels" && <ChannelsTab ws={ws} />}
            {tab === "connect" && <ConnectTab ws={ws} />}
            {tab === "telemetry" && <TelemetryTab ws={ws} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
