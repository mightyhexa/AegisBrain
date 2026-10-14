"""FastAPI application entry point for the AegisBrain Policy Gateway."""

from __future__ import annotations

import traceback
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AegisBrain Policy Gateway",
    version="0.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|[\w-]+\.vercel\.app)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

_STARTUP_ERROR: str | None = None

try:
    from app.api.v1.audit import router as audit_router
    from app.api.v1.evaluate import router as evaluate_router
    from app.api.v1.holds import router as holds_router
    from app.api.v1.policies import router as policies_router
    from app.api.v1.policy_lifecycle import router as policy_lifecycle_router
    from app.api.v1.real_integrations import router as real_integrations_router
    from app.core.security_middleware import SecurityHeadersMiddleware

    app.add_middleware(SecurityHeadersMiddleware)
    app.include_router(evaluate_router, prefix="/v1")
    app.include_router(policies_router, prefix="/v1")
    app.include_router(policy_lifecycle_router, prefix="/v1")
    app.include_router(holds_router, prefix="/v1")
    app.include_router(audit_router, prefix="/v1")
    app.include_router(real_integrations_router, prefix="/v1")
except Exception:
    _STARTUP_ERROR = traceback.format_exc()


@app.get("/")
@app.get("/health")
@app.get("/healthz")
def healthz() -> dict[str, str | None]:
    if _STARTUP_ERROR:
        return {"status": "error", "detail": _STARTUP_ERROR}
    return {"status": "ok", "service": "aegisbrain-gateway", "environment": "cloud"}
