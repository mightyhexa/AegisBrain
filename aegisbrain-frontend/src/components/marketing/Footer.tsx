// src/components/marketing/Footer.tsx
"use client";

import Link from "next/link";
import Logo from "./Logo";
import { site, nav, legalLinks } from "@/lib/site.config";

export default function Footer() {
  const siteName = site?.name ?? "AegisBrain";
  const navItems = nav ?? [];
  const legalItems = legalLinks ?? [];

  return (
    <footer className="border-t border-ice/80 bg-paper/60 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-12">
          {/* Brand Column */}
          <div className="md:col-span-5">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo />
              <span className="font-display text-xl font-semibold tracking-tight text-ink">
                {siteName}
              </span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              {site?.description ?? "Deterministic Policy Gateway for Autonomous AI Agents."}
            </p>
          </div>

          {/* Navigation Links */}
          <div className="md:col-span-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink">Navigation</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="transition hover:text-ink">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div className="md:col-span-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink">Legal & Compliance</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {legalItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="transition hover:text-ink">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ice/60 pt-8 text-xs text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} {siteName}. All rights reserved.</p>
          <p>Deterministic AST engine · Sub-millisecond evaluation</p>
        </div>
      </div>
    </footer>
  );
}