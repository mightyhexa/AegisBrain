import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Display: expressive grotesque for headlines and big numerals.
const display = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
  display: "swap",
});

// Body / UI: clean, slightly narrow sans.
const body = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  display: "swap",
});

// Code blocks only.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AegisBrain — Agent Policy Firewall",
  description:
    "AegisBrain turns decisions made in Slack into approved rules and checks every AI agent action against them before it runs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-sans antialiased bg-paper text-ink selection:bg-cobalt/20 selection:text-ink">
        {children}
      </body>
    </html>
  );
}