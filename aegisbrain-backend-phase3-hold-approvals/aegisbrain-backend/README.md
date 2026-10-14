# AegisBrain Backend — Phase 2: Policy Lifecycle and Human Locking

This remains a **local development MVP**, not a production enforcement boundary. It includes tenant-bound API-key authentication, server-derived tenant identity, permission scopes, key expiry/revocation, deterministic evaluation, draft-to-review-to-lock policy lifecycle, immutable policy content revisions, and separate per-tenant hash-chained decision and policy-lifecycle events. Production startup remains deliberately disabled pending database-level chain serialization, external audit checkpoints, the downstream tool-execution proxy, rate limiting, identity/authority integration, and deployment controls.

## Requirements

- Python 3.12 recommended
- PowerShell on Windows

## Local setup

Run these commands from `aegisbrain-backend`:

```powershell
# Activate the backend's virtual environment:
.\.venv\Scripts\Activate.ps1

python -m pip install -r requirements.txt

# Only create .env if it doesn't already exist:
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Do not overwrite an existing `.env`. Keep credentials out of Git, frontend bundles, screenshots, and chat messages.

## Verify

```powershell
python -m pytest -q
```

The Phase 2 suite contains **33 tests** covering the four playground scenarios, typed deterministic evaluation, idempotency, decision audit verification, API-key authentication, scope checks, expiry/revocation, cross-tenant isolation, policy draft/update/rejection/locking, separation of duties, version supersession, lifecycle audit verification and tamper detection, plus baseline bootstrap for a new tenant.

## Start the local API

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Health: `http://127.0.0.1:8000/healthz`
- API docs: `http://127.0.0.1:8000/docs`
- Evaluate: `POST http://127.0.0.1:8000/v1/evaluate`
- Active policies: `GET http://127.0.0.1:8000/v1/active-policies`
- Decision audit verification: `GET http://127.0.0.1:8000/v1/audit/verify`
- Policy drafts: `GET/POST http://127.0.0.1:8000/v1/policies/drafts`
- Edit draft: `PATCH http://127.0.0.1:8000/v1/policies/drafts/{revision_id}`
- Lock draft: `POST http://127.0.0.1:8000/v1/policies/drafts/{revision_id}/lock`
- Reject draft: `POST http://127.0.0.1:8000/v1/policies/drafts/{revision_id}/reject`
- Version history: `GET http://127.0.0.1:8000/v1/policies/history/{policy_key}`
- Policy lifecycle audit verification: `GET http://127.0.0.1:8000/v1/policies/audit/verify`

## API-key model

Create a tenant-bound key from a terminal on the machine running the backend:

```powershell
python -m app.cli create-api-key --tenant-id demo-tenant --name "local runtime" --role runtime --expires-days 90
```

Supported roles and permissions:

- `runtime`: `gateway:evaluate`
- `policy_reader`: `policies:read`, `audit:read`
- `policy_admin`: read policies/audit and create/update policy drafts; cannot lock or reject policies
- `tenant_admin`: all currently defined scopes

The command prints the API key **once**. The database stores only a SHA-256 hash of its high-entropy secret, not the presented plaintext token. Store the key in an approved secret manager. Do not put an agent API key into `NEXT_PUBLIC_*` frontend variables. To revoke it, use the key ID printed during creation:

```powershell
python -m app.cli revoke-api-key --key-id <KEY_ID>
```

Create a separate tenant with no policies:

```powershell
python -m app.cli create-tenant --tenant-id acme-dev --name "Acme Development"
python -m app.cli create-api-key --tenant-id acme-dev --name "acme runtime" --role runtime --expires-days 90
```

A newly created tenant has no approved baseline and therefore evaluations fail closed until its policy bundle is created, reviewed, and locked. Use `POST /v1/policies/drafts/bootstrap-baseline` with an authorized admin key to create drafts for the three synthetic baseline rules. A different `tenant_admin` API-key identity must lock each draft (separation of duties). The actor identifier currently records the API key ID; a production identity-provider integration is still required to bind that to verified human identities. Tenant identity for authenticated calls is taken from the API-key record; clients cannot choose a tenant through request JSON or query parameters.

## Development playground compatibility

When `APP_ENV=development`, requests without an `Authorization` header are intentionally limited to the configured `DEMO_TENANT_ID` so the current browser playground continues to work. This is a **local-only compatibility mode**, not production authentication. If an Authorization header is supplied but malformed, expired, revoked, or invalid, the request is rejected rather than falling back to the demo identity. Outside development, all protected endpoints require a valid bearer API key.

The frontend can keep `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` for its local, unauthenticated demo call. Never put an actual runtime API key in a `NEXT_PUBLIC_*` variable or ship one to a browser; use a trusted server-side proxy if a real user session is later connected to protected endpoints.

## Policy lifecycle API

1. A `policy_admin` or `tenant_admin` creates a draft with `POST /v1/policies/drafts`. The typed condition schema is validated before the draft is stored.
2. The author may update a draft with `PATCH /v1/policies/drafts/{revision_id}`. Drafts are not evaluated.
3. A different `tenant_admin` API key must lock the draft with `POST /v1/policies/drafts/{revision_id}/lock`. Self-approval is rejected. Locking updates the active enforcement snapshot transactionally and records the approver and lock time.
4. A reviewer may reject a draft with `POST /v1/policies/drafts/{revision_id}/reject`. Rejected and superseded content remains in version history.
5. `GET /v1/policies/history/{policy_key}` returns the tenant-scoped version history. `GET /v1/policies/audit/verify` verifies the lifecycle event hash chain.

The `policy_revisions` and `policy_lifecycle_events` tables are additive: startup `create_all` creates them in an existing local SQLite database and the seed initializer snapshots already-locked active policies into revision history when the corresponding revision is absent. Back up the local database before updating. These SQLite development migrations are not a substitute for reviewed Alembic migrations in production.

## Current synthetic demo scenarios

| Action | Input | Expected decision | Policy |
|---|---|---|---|
| `refunds.create` | `amount_inr=8000` | `hold` | `refund_cap_v1` |
| `discounts.apply` | `discount_pct=10`, `customer_tier=regular` | `deny` | `promo_cap_v2` |
| `discounts.apply` | `discount_pct=10`, `customer_tier=vip` | `hold` | `promo_vip_exception_v1` |
| `orders.update_status` | valid order ID and `DISPATCHED` status | `allow` | no policy matched |

The seed rules and their Slack-like provenance fields are synthetic fixtures, not real Slack messages or human approvals.

## Security boundaries still outstanding

- The current endpoint evaluates and audits requests; it does not execute downstream tools or prevent agents from bypassing the gateway to call third-party services directly.
- Slack event verification and ingestion, LLM-backed compile-time drafting, managed human identity, and authoritative role administration remain outstanding. The local preset bootstrap is explicitly synthetic and is not evidence of a real Slack decision.
- Decision and policy lifecycle audit writers use in-process serialization and SQLite in the local profile. Production requires database-level writer serialization, externally anchored checkpoints, and operational recovery procedures.
- This project is not ready to expose to the public internet or to gate real financial/destructive actions. Production startup intentionally fails until the remaining controls are implemented and reviewed.

## Phase 3 — HOLD approvals and one-time authorization tokens

Phase 3 adds tenant-scoped HOLD records, manager approval, short-lived payload-bound
single-use tokens, and a dedicated SHA-256 hash-chained HOLD audit log. It keeps the
existing `/v1/evaluate` response contract unchanged for the web playground.

### Lifecycle

1. A deterministic `HOLD` from `POST /v1/evaluate` creates an idempotent `pending`
   record in `hold_requests`, bound to the tenant, request ID, agent ID, action,
   exact JSON parameters, and original decision audit hash.
2. A tenant-bound `tenant_admin` other than the originating API-key identity calls
   `POST /v1/holds/{request_id}/approve`. The service returns a 300-second token once
   and stores only its SHA-256 digest.
3. A tenant-bound runtime API key calls `POST /v1/holds/{request_id}/consume` with
   `X-Aegis-Approval-Token` and the original `agent_id`, `action`, and `params`. Any
   payload discrepancy is rejected. Correct use consumes the token atomically, and
   replays are rejected.
4. `GET /v1/holds/audit/verify` verifies the per-tenant HOLD event hash chain.

Other useful endpoints:

- `GET /v1/holds?status=pending` — list a tenant's HOLD requests
- `GET /v1/holds/{request_id}` — inspect one tenant-scoped request
- `GET /v1/holds/audit/verify` — verify HOLD approval event provenance

### Live verification with no manual key entry

With FastAPI running on `127.0.0.1:8000`, from this backend directory run:

```powershell
.\.venv\Scripts\python.exe .\scripts\verify_phase3_holds.py
```

The smoke test creates temporary tenant-bound credentials in the current local DB,
performs the HOLD/approval/self-approval/payload-tampering/single-use/audit checks,
then revokes the temporary keys. It does not print token values.

### Critical limitation

`/v1/holds/{request_id}/consume` returns an authorization result and consumes the token;
it does **not** invoke Stripe, Razorpay, or any other downstream tool. Do not interpret
`authorized: true` as proof that an action ran. Actual actions must be routed through a
gateway-controlled execution adapter with connector credentials held only server-side,
idempotency, retry/failure semantics, and auditing before real financial or destructive
operations can be safely enabled.

### Local verification status

The complete Phase 0–3 suite currently contains **38 tests**, all passing in the clean
reference extraction. Production startup remains intentionally disabled in this MVP.
