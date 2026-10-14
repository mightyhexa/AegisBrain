"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Reveal from "@/components/motion/Reveal";

export type TimelineItem = { title: string; body: string };

/* A vertical timeline. The blue line fills as you scroll through it. */
export default function ScrollTimeline({ items }: { items: TimelineItem[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });
  const fill = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div className="relative">
      <div className="absolute bottom-3 left-[19px] top-3 w-px bg-ice" aria-hidden="true" />
      <motion.div
        className="absolute bottom-3 left-[19px] top-3 w-px origin-top bg-cobalt"
        style={{ scaleY: fill }}
        aria-hidden="true"
      />
      <ol ref={ref} className="space-y-12">
        {items.map((it, i) => (
          <li key={it.title} className="relative pl-16">
            <span className="absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border border-ice bg-paper font-display text-lg font-semibold text-cobalt">
              {i + 1}
            </span>
            <Reveal>
              <h3 className="font-display text-2xl font-semibold tracking-tight">{it.title}</h3>
              <p className="mt-2 max-w-xl text-lg leading-relaxed text-muted">{it.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  );
}