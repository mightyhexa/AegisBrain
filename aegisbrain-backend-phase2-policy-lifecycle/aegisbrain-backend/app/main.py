"""FastAPI application entry point for the AegisBrain local development gateway."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.audit import router as audit_router
from app.api.v1.evaluate import router as evaluate_router
from app.api.v1.policies import router as policies_router
from app.api.v1.policy_lifecycle import router as policy_lifecycle_router
from app.config import settings
from app.db.seed import initialize_database
from app.schemas.evaluate import HealthResponse


@asynccontextmanager
async def lifespan(_app: FastAPI):
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
    version="0.3.0-phase2-policy-lifecycle",
    description=(
        "Local AegisBrain gateway with tenant-bound API keys, scoped policy drafting and review, "
        "deterministic policy evaluation, and separate tamper-evident decision and policy-lifecycle "
        "audit chains. Production deployment remains disabled pending execution-proxy and deployment controls."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(evaluate_router, prefix="/v1")
app.include_router(policies_router, prefix="/v1")
app.include_router(policy_lifecycle_router, prefix="/v1")
app.include_router(audit_router, prefix="/v1")


@app.get("/healthz", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="aegisbrain-gateway", environment=settings.app_env)
