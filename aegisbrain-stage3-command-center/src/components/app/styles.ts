export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Frosted bluish-white surfaces. No black boxes anywhere.
export const card =
  "rounded-[28px] border border-white/85 bg-gradient-to-b from-white/95 to-[#EDF3FF]/90 shadow-[0_32px_80px_-20px_rgba(43,84,240,0.22),0_10px_28px_rgba(11,26,51,0.06)] backdrop-blur-2xl";

export const codeBox =
  "rounded-2xl border border-cobalt/20 bg-gradient-to-b from-[#F5F9FF] to-[#E8F1FF] font-mono text-ink shadow-inner";

export const field =
  "mt-1.5 w-full rounded-xl border border-ice bg-white/85 px-4 py-3 text-[16px] outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/20";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-cobalt px-7 py-3.5 font-medium text-white shadow-[0_10px_30px_-8px_rgba(43,84,240,0.6)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-full border border-ice bg-white/80 px-6 py-3 font-medium transition hover:bg-white active:scale-[0.98] disabled:opacity-50";

export type VerdictKey = "allow" | "hold" | "deny";

export const VERDICT: Record<VerdictKey, { label: string; text: string; bg: string; border: string }> = {
  allow: { label: "Allowed", text: "text-allow", bg: "bg-allow/10", border: "border-allow/30" },
  hold: { label: "Held for approval", text: "text-hold", bg: "bg-hold/10", border: "border-hold/30" },
  deny: { label: "Blocked", text: "text-deny", bg: "bg-deny/10", border: "border-deny/30" },
};

export function verdictOf(decision: string): VerdictKey {
  const d = decision.toLowerCase();
  if (d === "allow") return "allow";
  if (d === "deny") return "deny";
  return "hold"; // hold, escalate, pending
}
