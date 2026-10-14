# 🛡️ AegisBrain

**Sub-Millisecond AST Policy Gateway & Runtime Firewall for Autonomous AI Agents**

*Your AI agents follow the rules your leadership decided today—not last year's hardcoded prompts.*

---

## ⚡ Overview

Enterprise teams deploy autonomous AI agents across customer support, checkout discounts, refunds, and logistics, while business rules change daily in **Slack channels, WhatsApp groups, and Gmail threads**.

**AegisBrain** bridges human leadership and machine execution:
1. **Channel Ingestion:** Watches opt-in leadership channels (Slack, WhatsApp, Gmail) for policy updates.
2. **1-Tap Manager Verification:** Sends a cryptographic HMAC-SHA256 approval link via **Gmail SMTP** or **WhatsApp** to the decision-maker before any rule changes.
3. **Sub-Millisecond AST Enforcement (`< 0.45 ms`):** Compiles approved rules into a pure-Python Abstract Syntax Tree backed by **Supabase PostgreSQL**.
4. **Live Parameter Auto-Correction:** Intercepts outdated AI agents (e.g., offering a `10%` discount when the active cap is `3%`) and automatically rewrites the parameter to `3%` in real time.
5. **Triple SHA-256 Audit Ledger:** Seals every agent decision, hold token, and policy revision into a tamper-evident cryptographic hash chain.

---

## 📂 Project Structure

- **`aegisbrain-backend/`** — FastAPI Policy Gateway, AST Evaluator, Triple SHA-256 Audit Chain, Gmail SMTP & WhatsApp integrations, and the `aegis_sdk.py` Python Agent SDK.
- **`aegisbrain-frontend/`** — Next.js 15 Interactive Sandbox, WebGL2 Silk Shader, 3D Perspective UI, and 3-Stage Executive Manager Portal.

---

## 🚀 Quickstart

### 1. Backend (`Port 8000`)
```powershell
cd aegisbrain-backend
& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --port 8000
