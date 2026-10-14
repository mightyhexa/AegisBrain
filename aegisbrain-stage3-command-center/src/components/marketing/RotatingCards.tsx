"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

/* ------------------------------------------------------------------ */
/* A scroll-driven 3D fan of the product's six parts.                  */
/* The section is pinned. As you scroll through it the fan rotates     */
/* smoothly (a spring follows your scroll, so it never jumps).         */
/* On entering the screen the stacked deck fans open.                  */
/* Cards further from the centre are smaller, fainter and softly       */
/* blurred, which gives depth. Reduced motion gets a plain grid.       */
/* The previews are interface illustrations with example data.         */
/* ------------------------------------------------------------------ */

type Module = { id: string; tag: string; title: string; blurb: string; preview: React.ReactNode };

const chip = "rounded-full px-3 py-1 text-[11px] font-medium";

const MODULES: Module[] = [
  {
    id: "inbox",
    tag: "Step 1",
    title: "Policy Inbox",
    blurb: "A manager's decision becomes a draft rule. A person approves it with one click.",
    preview: (
      <div className="space-y-3 text-[12px]">
        <div className="rounded-xl bg-mist p-3">
          <p className="text-muted">Original message</p>
          <p className="mt-1">&ldquo;From today, discounts are capped at 5%.&rdquo;</p>
        </div>
        <p className="font-display text-base font-semibold">Block any discount above 5%.</p>
        <div className="flex gap-2">
          <span className={`${chip} bg-cobalt text-white`}>Lock rule</span>
          <span className={`${chip} border border-ice`}>Edit</span>
          <span className={`${chip} border border-ice text-muted`}>Ignore</span>
        </div>
      </div>
    ),
  },
  {
    id: "authority",
    tag: "Step 2",
    title: "Who may set rules",
    blurb: "Only people with the right role can propose each kind of rule.",
    preview: (
      <div className="space-y-2 text-[12px]">
        {[
          ["Finance director", "Refunds, discounts"],
          ["Support lead", "Refunds"],
          ["Everyone else", "No rule rights"],
        ].map(([r, m]) => (
          <div key={r} className="flex items-center justify-between rounded-xl bg-mist px-3 py-2.5">
            <span className="font-medium">{r}</span>
            <span className="text-muted">{m}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "verdict",
    tag: "Step 3",
    title: "Gateway decisions",
    blurb: "Every agent action is checked against the approved rules before it runs.",
    preview: (
      <div className="space-y-2 text-[12px]">
        <div className="flex items-center justify-between rounded-xl border border-deny/30 bg-deny/10 px-3 py-3">
          <span>Agent asks for 10% off</span>
          <span className="font-display text-base font-semibold text-deny">Blocked</span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-allow/30 bg-allow/10 px-3 py-3">
          <span>Agent asks for 5% off</span>
          <span className="font-display text-base font-semibold text-allow">Allowed</span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-hold/30 bg-hold/10 px-3 py-3">
          <span>VIP asks for 10% off</span>
          <span className="font-display text-base font-semibold text-hold">Held</span>
        </div>
      </div>
    ),
  },
  {
    id: "audit",
    tag: "Step 4",
    title: "Decision log",
    blurb: "Every decision is recorded with the rule that applied and who approved it.",
    preview: (
      <div className="space-y-2 font-mono text-[11px]">
        {[
          ["09:41", "discounts.apply", "blocked"],
          ["09:42", "discounts.apply", "allowed"],
          ["09:44", "refunds.create", "held"],
        ].map((r) => (
          <div key={r[0]} className="grid grid-cols-[2.6rem_1fr_3.4rem] gap-2 rounded-lg bg-mist px-2.5 py-2">
            <span className="text-muted">{r[0]}</span>
            <span className="truncate">{r[1]}</span>
            <span className="text-right">{r[2]}</span>
          </div>
        ))}
        <p className="pt-1 font-sans text-[11px] text-muted">Rule: promo_cap_v2, approved by a finance lead.</p>
      </div>
    ),
  },
  {
    id: "shadow",
    tag: "Start here",
    title: "Shadow report",
    blurb: "Begin without blocking anything. See what we would have stopped first.",
    preview: (
      <div className="space-y-3 text-[12px]">
        <p className="text-muted">Actions we would have blocked, by rule</p>
        {[
          ["promo_cap_v2", "w-4/5"],
          ["refund_cap_v1", "w-3/5"],
          ["vip_exception", "w-2/5"],
        ].map(([n, w]) => (
          <div key={n}>
            <p className="font-mono text-[11px]">{n}</p>
            <div className="mt-1 h-2 rounded-full bg-mist">
              <div className={`h-2 rounded-full bg-cobalt ${w}`} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "onboarding",
    tag: "Setup",
    title: "Guided setup",
    blurb: "Register your company, connect your chat, list your agents. Step by step.",
    preview: (
      <ol className="space-y-2 text-[12px]">
        {["Company details", "Your team and roles", "Connect your chat", "Register your agents", "Review and start"].map(
          (s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-xl bg-mist px-3 py-2.5">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                  i < 2 ? "bg-cobalt text-white" : "border border-ice bg-white text-muted"
                }`}
              >
                {i + 1}
              </span>
              {s}
            </li>
          )
        )}
      </ol>
    ),
  },
];

/* One card's face. Solid white with a blue-tinted shadow, so it reads
   clearly on the pale blue background at any angle. */
function Face({ m }: { m: Module }) {
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-[30px] border border-ice bg-gradient-to-b from-white to-[#EDF3FF] p-6"
      style={{ boxShadow: "0 44px 90px -24px rgba(43,84,240,0.38), 0 10px 28px rgba(11,26,51,0.10)" }}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cobalt/0 via-cobalt to-cobalt/0" />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-cobalt">{m.tag}</p>
      <p className="mt-1 font-display text-[22px] font-semibold tracking-tight text-ink">{m.title}</p>
      <p className="mt-1.5 text-[14px] leading-snug text-muted">{m.blurb}</p>
      <div className="mt-5">{m.preview}</div>
      <p className="mt-auto pt-4 text-[11px] text-muted">Interface preview with example data</p>
    </div>
  );
}

/* One card inside the fan. Every value is derived from a single number:
   d = how far this card is from the centre (0 = centre, 1 = next to it). */
function CardLayer({
  i,
  m,
  pos,
  open,
  spread,
  w,
  h,
  onPick,
}: {
  i: number;
  m: Module;
  pos: MotionValue<number>;
  open: MotionValue<number>;
  spread: MotionValue<number>;
  w: number;
  h: number;
  onPick: () => void;
}) {
  const d = useTransform(pos, (p) => i - p);
  const x = useTransform([d, spread, open], (v) => {
    const [dv, s, o] = v as number[];
    return dv * s * o;
  });
  const y = useTransform([d, open], (v) => {
    const [dv, o] = v as number[];
    return Math.min(dv * dv, 9) * 14 * o; // side cards sit lower, forming an arc
  });
  const z = useTransform([d, open], (v) => {
    const [dv, o] = v as number[];
    return -Math.min(Math.abs(dv), 3) * 200 * o;
  });
  const rotateY = useTransform([d, open], (v) => {
    const [dv, o] = v as number[];
    return -Math.max(-3, Math.min(3, dv)) * 24 * o;
  });
  const rotateZ = useTransform([d, open], (v) => {
    const [dv, o] = v as number[];
    return Math.max(-3, Math.min(3, dv)) * 5.5 * o; // the fan tilt
  });
  const scale = useTransform(d, (dv) => 1 - Math.min(Math.abs(dv), 3) * 0.07);
  const opacity = useTransform(d, (dv) => Math.max(0, 1 - Math.max(0, Math.abs(dv) - 0.2) * 0.38));
  // Depth is shown with a pale haze (opacity only, GPU-cheap) instead of a blur filter.
  const haze = useTransform(d, (dv) => Math.min(Math.abs(dv), 2.5) * 0.14);
  const zIndex = useTransform(d, (dv) => 100 - Math.round(Math.abs(dv) * 10));

  return (
    <motion.article
      aria-label={`${m.title}: ${m.blurb}`}
      className="absolute left-1/2 top-1/2"
      style={{
        width: w,
        height: h,
        marginLeft: -w / 2,
        marginTop: -h / 2,
        x,
        y,
        z,
        rotateY,
        rotateZ,
        scale,
        opacity,
        zIndex,
        transformPerspective: 1500,
        willChange: "transform, opacity",
        pointerEvents: "auto",
        cursor: "pointer",
      }}
    >
      <div className="relative h-full" onClick={onPick}>
        <Face m={m} />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[30px] bg-[#F2F6FD]"
          style={{ opacity: haze }}
        />
      </div>
    </motion.article>
  );
}

function ScrollFan() {
  const n = MODULES.length;
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { amount: 0.4, once: true });

  const open = useMotionValue(0); // 0 = stacked deck, 1 = fanned out
  const spread = useMotionValue(300);
  const [dims, setDims] = useState({ w: 330, h: 462 });
  const [activeIdx, setActiveIdx] = useState(0);

  // Scroll progress through the pinned section, smoothed by a spring.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.4 });
  const pos = useTransform(smooth, [0, 1], [0, n - 1]);

  useMotionValueEvent(pos, "change", (v) => setActiveIdx(Math.round(v)));

  // Size the fan to the screen.
  useEffect(() => {
    const measure = () => {
      const vw = window.innerWidth;
      if (vw < 520) {
        const w = Math.min(280, Math.round(vw * 0.74));
        setDims({ w, h: Math.max(400, Math.round(w * 1.42)) });
        spread.set(vw * 0.52);
      } else if (vw < 900) {
        setDims({ w: 310, h: 440 });
        spread.set(vw * 0.34);
      } else {
        setDims({ w: 330, h: 462 });
        spread.set(Math.min(340, vw * 0.25));
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [spread]);

  // The deck fans open the first time the section is on screen.
  useEffect(() => {
    if (!inView) return;
    const controls = animate(open, 1, { duration: 1.6, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [inView, open]);

  // Dots jump to a card by scrolling to the matching point in the section.
  const go = (i: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const scrollable = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (i / (n - 1)) * scrollable, behavior: "smooth" });
  };

  const current = MODULES[activeIdx] ?? MODULES[0];

  return (
    <div ref={sectionRef} className="relative" style={{ height: `${n * 60 + 60}vh` }}>
      <div ref={stageRef} className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
        {/* The fan */}
        <motion.div
          className="relative w-full"
          style={{ height: dims.h + 60 }}
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          {MODULES.map((m, i) => (
            <CardLayer key={m.id} i={i} m={m} pos={pos} open={open} spread={spread} w={dims.w} h={dims.h} onPick={() => go(i)} />
          ))}
        </motion.div>

        {/* Caption, progress line and dots */}
        <motion.div
          className="mt-6 w-full max-w-md px-6"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
        >
          <div className="h-px w-full bg-ice">
            <motion.div className="h-px origin-left bg-cobalt" style={{ scaleX: smooth }} />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="min-h-[1.75rem]" aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.p
                  key={current.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="font-display text-lg font-semibold tracking-tight"
                >
                  <span className="mr-2 text-cobalt">
                    {String(activeIdx + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
                  </span>
                  {current.title}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="flex gap-2" role="tablist" aria-label="Jump to a part">
              {MODULES.map((m, i) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={i === activeIdx}
                  aria-label={`Show ${m.title}`}
                  onClick={() => go(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    i === activeIdx ? "w-7 bg-cobalt" : "w-2.5 bg-ice hover:bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-sm text-muted">Scroll to turn the cards</p>
        </motion.div>
      </div>
    </div>
  );
}

export default function RotatingCards() {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <ul className="mx-auto grid max-w-7xl gap-6 px-6 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <li key={m.id} className="min-h-[420px]">
            <Face m={m} />
          </li>
        ))}
      </ul>
    );
  }

  return <ScrollFan />;
}
