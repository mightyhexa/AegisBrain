import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Best-effort limiter: it resets when the server restarts and is per instance.
// Real protection comes later (a proper gateway or Cloudflare rules).
const hits = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) {
    return NextResponse.json({ message: "Too many messages. Please try again later." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "That request was not valid." }, { status: 400 });
  }

  // Honeypot: real people never fill this field.
  if (clean(body.website, 200)) return NextResponse.json({ ok: true });

  const name = clean(body.name, 120);
  const email = clean(body.email, 200);
  const company = clean(body.company, 160);
  const role = clean(body.role, 120);
  const message = String(body.message ?? "").trim().slice(0, 4000);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!name || !emailOk || !company || message.length < 20 || body.consent !== true) {
    return NextResponse.json(
      { message: "Please fill in every required field and tick the consent box." },
      { status: 400 }
    );
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  const from = process.env.CONTACT_FROM_EMAIL;

  if (!key || !to || !from) {
    return NextResponse.json(
      { message: "The contact form is not switched on yet. Please email us directly." },
      { status: 503 }
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: email,
      subject: `New enquiry from ${company}`,
      text: [`Name: ${name}`, `Email: ${email}`, `Company: ${company}`, `Role: ${role || "-"}`, "", message].join("\n"),
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ message: "We could not send your message. Please email us directly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}