"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, Sparkles } from "lucide-react";
import { ApiError, asList, ingestChannel, listChannels, pick, pickKey, type IngestRequest } from "@/lib/api";
import type { Workspace } from "@/lib/workspace";
import JsonTree from "./JsonTree";
import { EASE, btnPrimary, card, field } from "./styles";

type Provider = IngestRequest["provider"];

const PROVIDERS: { id: Provider; label: string; target: string }[] = [
  { id: "slack", label: "Slack", target: "#ops-policies" },
  { id: "whatsapp", label: "WhatsApp", target: "manager-group" },
  { id: "gmail", label: "Gmail", target: "policies@yourcompany.com" },
];

const EXAMPLES = [
  "Hold any refund above 5000 for manager review",
  "From today, discounts are capped at 5%",
  "VIP customers may get up to 10% off with approval",
];

export default function ChannelsTab({ ws }: { ws: Workspace }) {
  const key = pickKey(ws.credentials, ["policy_admin", "tenant_admin"]);
  const [provider, setProvider] = useState<Provider>("slack");
  const [target, setTarget] = useState(PROVIDERS[0].target);
  const [sender, setSender] = useState(ws.email);
  const [text, setText] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [channels, setChannels] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    let live = true;
    listChannels(key)
      .then((r) => live && setChannels(asList(r.data)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);

  function choose(p: (typeof PROVIDERS)[number]) {
    setProvider(p.id);
    setTarget(p.target);
  }

  async function compile() {
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const { data } = await ingestChannel(
        { provider, channel_target: target, sender_identifier: sender, message_text: text },
        key
      );
      setResult(data);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const ast = result && "compiled_ast" in result ? result.compiled_ast : null;
  const draft = result && "draft" in result ? result.draft : result && "revision" in result ? result.revision : null;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className={`${card} p-6 lg:col-span-5`}>
        <p className="font-display text-xl font-semibold tracking-tight">Message source simulator</p>
        <p className="mt-1 text-sm text-muted">
          Type a manager&apos;s message as if it arrived from one of these channels. We turn it into a draft rule. Nothing
          becomes live until a person approves it.
        </p>

        <div className="relative mt-5 grid grid-cols-3 rounded-full border border-ice bg-mist p-1" role="tablist">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={provider === p.id}
              onClick={() => choose(p)}
              className="relative z-10 rounded-full py-2 text-sm font-medium"
            >
              {provider === p.id && (
                <motion.span
                  layoutId="provider-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              {p.label}
            </button>
          ))}
        </div>

        <label className="mt-5 block text-sm font-medium">
          Channel
          <input value={target} onChange={(e) => setTarget(e.target.value)} className={field} />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Sender (must be on your allowed list)
          <input value={sender} onChange={(e) => setSender(e.target.value)} className={field} />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Message
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className={field} />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setText(x)}
              className="rounded-full border border-ice bg-white/80 px-3 py-1.5 text-left text-xs transition hover:border-cobalt/40 hover:bg-white"
            >
              {x}
            </button>
          ))}
        </div>

        <button onClick={compile} disabled={busy || !text.trim()} className={`${btnPrimary} mt-6 w-full`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? "Turning it into a rule" : "Turn into a draft rule"}
        </button>
        <p className="mt-3 min-h-[1.25rem] text-sm text-deny" role="alert" aria-live="polite">
          {err}
        </p>
      </div>

      <div className="space-y-6 lg:col-span-7">
        <div className={`${card} min-h-[320px] p-6`}>
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="space-y-5"
              >
                <p className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
                  <Sparkles className="h-5 w-5 text-cobalt" /> Draft rule created
                </p>
                {ast ? (
                  <div>
                    <p className="mb-2 text-sm text-muted">The rule, as the gateway reads it</p>
                    <JsonTree data={ast} />
                  </div>
                ) : (
                  <JsonTree data={result} />
                )}
                {draft ? (
                  <div>
                    <p className="mb-2 text-sm text-muted">Waiting for a person to approve it</p>
                    <JsonTree data={draft} />
                  </div>
                ) : null}
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex h-[270px] flex-col items-center justify-center text-center"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-mist text-cobalt">
                  <Sparkles className="h-7 w-7" />
                </span>
                <p className="mt-4 font-display text-xl font-semibold">Nothing compiled yet</p>
                <p className="mt-1 max-w-xs text-muted">Pick an example on the left and press the button.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {channels.length > 0 && (
          <div className={`${card} p-6`}>
            <p className="font-display text-xl font-semibold tracking-tight">Connected channels</p>
            <ul className="mt-3 divide-y divide-ice">
              {channels.map((c, i) => (
                <li key={i} className="flex items-center justify-between py-3 text-[15px]">
                  <span className="font-medium capitalize">{pick(c, "provider", "type", "name") || "channel"}</span>
                  <span className="text-muted">{pick(c, "channel_target", "target", "channel", "status")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
