"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";

export default function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={done ? "Copied" : label}
      className={`inline-flex min-w-[5.5rem] items-center justify-center rounded-full border border-ice bg-white/85 px-3.5 py-2 text-sm font-medium transition hover:bg-white active:scale-95 ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.span
            key="ok"
            initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            className="flex items-center gap-1.5 text-allow"
          >
            <Check className="h-4 w-4" /> Copied
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5"
          >
            <Copy className="h-4 w-4" /> {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
