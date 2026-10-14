"use client";

import Link from "next/link";
import { useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

const field =
  "mt-1.5 w-full rounded-xl border border-ice bg-white/80 px-4 py-3 text-[16px] outline-none transition focus:border-cobalt focus:ring-2 focus:ring-cobalt/20";

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, consent: data.consent === "on" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(json.message ?? "Something went wrong. Please email us instead.");
        return;
      }
      setStatus("sent");
      form.reset();
    } catch {
      setStatus("error");
      setMessage("Network problem. Please try again, or email us directly.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-[28px] border border-ice bg-white/70 p-8 backdrop-blur-md" role="status">
        <p className="font-display text-2xl font-semibold">Thank you. We have your message.</p>
        <p className="mt-2 text-muted">We will reply to the email address you gave us.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-[28px] border border-ice bg-white/70 p-6 backdrop-blur-md md:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Your name
          <input name="name" required maxLength={120} autoComplete="name" className={field} />
        </label>
        <label className="block text-sm font-medium">
          Work email
          <input name="email" type="email" required maxLength={200} autoComplete="email" className={field} />
        </label>
        <label className="block text-sm font-medium">
          Company
          <input name="company" required maxLength={160} autoComplete="organization" className={field} />
        </label>
        <label className="block text-sm font-medium">
          Your role <span className="font-normal text-muted">(optional)</span>
          <input name="role" maxLength={120} autoComplete="organization-title" className={field} />
        </label>
      </div>
      <label className="mt-5 block text-sm font-medium">
        How are you using AI agents today?
        <textarea name="message" required minLength={20} maxLength={4000} rows={5} className={field} />
      </label>
      {/* Hidden field that only bots fill in */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="mt-5 flex items-start gap-3 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-[#2B54F0]" />
        <span>
          I agree that you may use these details to reply to me, as described in the{" "}
          <Link href="/legal/privacy" className="text-cobalt underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-6 rounded-full bg-cobalt px-8 py-3.5 font-medium text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "sending" ? "Sending" : "Send message"}
      </button>
      <p className="mt-4 min-h-[1.5rem] text-sm text-deny" role="alert" aria-live="polite">
        {status === "error" ? message : ""}
      </p>
    </form>
  );
}