"use client";

import { motion } from "framer-motion";
import { codeBox } from "./styles";

/* Shows any JSON as an indented tree whose lines reveal one after another. */

function Prim({ v }: { v: unknown }) {
  if (typeof v === "string") return <span className="text-[#0F7B5F]">&quot;{v}&quot;</span>;
  if (typeof v === "number") return <span className="text-hold">{v}</span>;
  if (typeof v === "boolean") return <span className="text-cobalt">{String(v)}</span>;
  return <span className="text-muted">null</span>;
}

function Node({ name, v, depth, base }: { name?: string; v: unknown; depth: number; base: number }) {
  const delay = Math.min(base, 1.2);
  const pad = { paddingLeft: depth * 16 };
  const anim = {
    initial: { opacity: 0, x: -8 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.3, delay },
  };

  if (v === null || typeof v !== "object") {
    return (
      <motion.div {...anim} style={pad} className="flex flex-wrap gap-1.5 break-all">
        {name !== undefined && <span className="text-cobalt">{name}:</span>}
        <Prim v={v} />
      </motion.div>
    );
  }

  const entries: [string, unknown][] = Array.isArray(v)
    ? v.map((x, i) => [String(i), x] as [string, unknown])
    : Object.entries(v as Record<string, unknown>);

  return (
    <div>
      <motion.div {...anim} style={pad} className="text-muted">
        {name !== undefined && <span className="text-cobalt">{name}: </span>}
        {Array.isArray(v) ? `[${entries.length}]` : "{"}
      </motion.div>
      {entries.slice(0, 60).map(([k, child], i) => (
        <Node key={k} name={Array.isArray(v) ? undefined : k} v={child} depth={depth + 1} base={base + 0.04 * (i + 1)} />
      ))}
    </div>
  );
}

export default function JsonTree({ data }: { data: unknown }) {
  return (
    <div className={`${codeBox} overflow-x-auto p-4 text-[13px] leading-relaxed`}>
      <Node v={data} depth={0} base={0} />
    </div>
  );
}
