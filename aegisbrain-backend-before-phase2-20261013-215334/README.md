# AegisBrain Backend — Stage 0

This is a **local development/demo** implementation of the Stage 0 deterministic policy gateway. It is not production-ready and intentionally refuses to start when `APP_ENV=production`: workload authentication, tenant-bound authorization, production-grade multi-worker audit serialization, externally anchored audit checkpoints, and the actual downstream tool-execution proxy have not been implemented yet.

## Requirements

- Python 3.12 recommended
- PowerShell on Windows

## Local setup

Run these commands from `aegisbrain-backend`:

```powershell
# Activate your existing virtual environment if it already exists:
.\.venv\Scripts\Activate.ps1

# If you have not created a virtual environment yet:
# py -3.12 -m venv .venv
# .\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

If `.env` already exists, do not overwrite it. Keep credentials out of Git and out of screenshots.

## Verify before starting the API

```powershell
python -m pytest -q
```

Expected result for this version: **18 tests passed**.

## Start the API

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Health: `http://127.0.0.1:8000/healthz`
- API docs: `http://127.0.0.1:8000/docs`
- Evaluate: `POST http://127.0.0.1:8000/v1/evaluate`
- Active policies: `GET http://127.0.0.1:8000/v1/active-policies`
- Audit verification: `GET http://127.0.0.1:8000/v1/audit/verify`

## Frontend integration

Set the following in `aegisbrain-frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Restart the Next.js development server after changing environment variables. The current frontend code constructs `POST /v1/evaluate` with `request_id`, `agent_id`, `action`, and `params`; this API returns lowercase `decision`, `policy_key`, and `reason`, plus diagnostic fields.

## Demo policy scenarios

| Action | Input | Expected decision | Policy |
|---|---|---|---|
| `refunds.create` | `amount_inr=8000` | `hold` | `refund_cap_v1` |
| `discounts.apply` | `discount_pct=10`, `customer_tier=regular` | `deny` | `promo_cap_v2` |
| `discounts.apply` | `discount_pct=10`, `customer_tier=vip` | `hold` | `promo_vip_exception_v1` |
| `orders.update_status` | valid order ID and `DISPATCHED` status | `allow` | no policy matched |

The seeded rules and their provenance fields are **synthetic local fixtures**, not actual Slack messages or human approvals.

## Stage 0 safety boundaries

- Runtime evaluation is deterministic Python only; there is no LLM call in the evaluation path.
- Unknown actions and invalid parameters are denied.
- The active baseline policy bundle must be complete; a missing or malformed baseline causes a fail-closed denial.
- The audit chain hashes canonical event data, the preceding digest, decision, policy attribution, and timestamp.
- The hash chain is tamper-evident, not inherently immutable. A database operator who can rewrite the entire database can also recalculate the chain; production needs external checkpoints/anchoring and stronger database transaction serialization.
- The current gateway evaluates and audits requests but does not execute downstream tools or inject third-party credentials.
- **Do not expose this unauthenticated Stage 0 API to the public internet or connect it to real financial/destructive actions.** The current homepage playground can fall back to local sample rules when the remote request fails; that behavior must be changed before any real enforcement workflow is represented as live.
