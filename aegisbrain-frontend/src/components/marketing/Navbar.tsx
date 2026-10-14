"use client";

import Link from "next/link";
import Logo from "./Logo";
import { site, nav } from "@/lib/site.config";

export default function Navbar() {
  const siteName = site?.name ?? "AegisBrain";
  const navItems = nav ?? [];

  return (
    <header className="sticky top-0 z-40 border-b border-ice/80 bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${siteName} home`}>
          <Logo />
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            {siteName}
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted transition hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="#contact"
            className="rounded-full bg-cobalt px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-cobalt/20 transition hover:brightness-110 active:scale-95"
          >
            Register Company
          </a>
        </div>
      </div>
    </header>
  );
}