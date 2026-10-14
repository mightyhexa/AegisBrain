"""FastAPI application entry point for the AegisBrain Policy Gateway."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.audit import router as audit_router
from app.api.v1.evaluate import router as evaluate_router
from app.api.v1.holds import router as holds_router
from app.api.v1.policies import router as policies_router
from app.api.v1.policy_lifecycle import router as policy_lifecycle_router
from app.api.v1.real_integrations import router as real_integrations_router
from app.config import settings
from app.core.security_middleware import SecurityHeadersMiddleware
from app.db.seed import initialize_database
from app.schemas.evaluate import HealthResponse


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Lifecycle manager handling database schema bootstrap and security checks."""
    if settings.app_env == "production":
        raise RuntimeError(
            "AegisBrain is not production-ready yet. Before production startup, complete the policy "
            "lifecycle and tenant bootstrap, production database/audit serialization, external audit "
            "checkpointing, rate limiting, downstream tool-execution proxy, and deployment hardening."
        )
    initialize_database()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.4.0-phase3-hold-approvals",
    description=(
        "AegisBrain Policy Gateway with tenant-bound API keys, deterministic AST policy evaluation, "
        "live Gmail SMTP & WhatsApp manager verification, policy lifecycle controls, and one-time "
        "payload-bound HOLD approval tokens."
    ),
    lifespan=lifespan,
)

# Security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# CORS middleware supporting localhost development + Vercel, Koyeb, Render, and Railway deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|[\w-]+\.vercel\.app|[\w-]+\.koyeb\.app|[\w-]+\.onrender\.com|[\w-]+\.up\.railway\.app)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Aegis-Approval-Token",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
)

# Mount API v1 core subsystems & real integrations
app.include_router(evaluate_router, prefix="/v1")
app.include_router(policies_router, prefix="/v1")
app.include_router(policy_lifecycle_router, prefix="/v1")
app.include_router(holds_router, prefix="/v1")
app.include_router(audit_router, prefix="/v1")
app.include_router(real_integrations_router, prefix="/v1")


@app.get("/", response_model=HealthResponse, tags=["health"], include_in_schema=False)
def root_status() -> HealthResponse:
    """Root probe for cloud load balancers (Koyeb / Render / Vercel)."""
    return HealthResponse(
        status="ok",
        service="aegisbrain-gateway",
        environment=settings.app_env,
    )


@app.get("/healthz", response_model=HealthResponse, tags=["health"])
def healthz() -> HealthResponse:
    """Primary health check probe returning service identity and environment status."""
    return HealthResponse(
        status="ok",
        service="aegisbrain-gateway",
        environment=settings.app_env,
    )


@app.get("/health", response_model=HealthResponse, tags=["health"], include_in_schema=False)
def health_alias() -> HealthResponse:
    """Alias route for standard orchestrator and browser health queries."""
    return healthz()