// One typed client for the AegisBrain gateway. Every page uses this file,
// so a backend change is a one-file fix.

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// DEVELOPER NOTE: this is the one place that decides how the key is sent.
// Open backend app/security/auth.py, check which header it reads, and change
// this line if it is not "Authorization: Bearer".
function authHeaders(key?: string): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function messageFrom(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d)))
      .join("; ");
  }
  if (detail && typeof detail === "object" && "message" in detail) return String((detail as { message: unknown }).message);
  return fallback;
}

type Opts = { method?: "GET" | "POST"; body?: unknown; key?: string; timeoutMs?: number };

export async function request<T>(path: string, opts: Opts = {}): Promise<{ data: T; ms: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);
  const t0 = performance.now();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json", ...authHeaders(opts.key) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const ms = performance.now() - t0;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) {
      const detail = json && typeof json === "object" && "detail" in json ? (json as { detail: unknown }).detail : json;
      throw new ApiError(messageFrom(detail, `Request failed (${res.status})`), res.status);
    }
    return { data: json as T, ms };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new ApiError("The gateway took too long to answer.", 0);
    throw new ApiError(`Could not reach the gateway at ${API_BASE}. Is the backend running?`, 0);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Types (field names match the backend contract) ---------- */

export type Credential = { key_id: string; role: string; scopes: string[]; api_key: string };

export type EvaluateRequest = { request_id: string; agent_id: string; action: string; params: Record<string, unknown> };
export type EvaluateResponse = {
  request_id: string;
  decision: string; // "allow" | "hold" | "deny"
  policy_key?: string | null;
  reason?: string;
  evaluated_at?: string;
  latency_ms?: number;
  audit_hash?: string;
};

export type RegisterRequest = {
  company_name: string;
  contact_name: string;
  work_email: string;
  role_title: string;
  agent_framework: string;
  monthly_action_volume: string;
  primary_use_case: string;
};
export type RegisterResponse = {
  registration_id?: string;
  tenant_id?: string;
  baseline_policies_seeded?: number | unknown[];
  credentials?: Credential[];
  [k: string]: unknown;
};

export type IngestRequest = {
  provider: "slack" | "whatsapp" | "gmail";
  channel_target: string;
  sender_identifier: string;
  message_text: string;
};

/* ---------- Calls ---------- */

export const evaluate = (body: EvaluateRequest, key?: string) =>
  request<EvaluateResponse>("/v1/evaluate", { method: "POST", body, key });

export const registerCompany = (body: RegisterRequest) =>
  request<RegisterResponse>("/v1/onboarding/register", { method: "POST", body, timeoutMs: 20000 });

export const listChannels = (key?: string) => request<unknown>("/v1/channels", { key });
export const ingestChannel = (body: IngestRequest, key?: string) =>
  request<Record<string, unknown>>("/v1/channels/ingest", { method: "POST", body, key, timeoutMs: 20000 });
export const listDecisions = (limit: number, key?: string) => request<unknown>(`/v1/decisions?limit=${limit}`, { key });
export const listActivePolicies = (key?: string) => request<unknown>("/v1/active-policies", { key });
export const verifyAudit = (key?: string) => request<Record<string, unknown>>("/v1/audit/verify", { key });

/* ---------- Helpers for responses whose exact shape can vary ---------- */

export function asList(x: unknown): Record<string, unknown>[] {
  if (Array.isArray(x)) return x as Record<string, unknown>[];
  if (x && typeof x === "object") {
    for (const k of ["items", "data", "results", "decisions", "policies", "channels", "connections"]) {
      const v = (x as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

export function pick(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

export function pickKey(creds: Credential[], roles: string[]): string | undefined {
  for (const r of roles) {
    const c = creds.find((x) => x.role === r);
    if (c) return c.api_key;
  }
  return undefined;
}
