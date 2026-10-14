"""FastAPI application entry point for AegisBrain Stage 0."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.audit import router as audit_router
from app.api.v1.evaluate import router as evaluate_router
from app.api.v1.policies import router as policies_router
from app.config import settings
from app.db.seed import initialize_database
from app.schemas.evaluate import HealthResponse


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.app_env == "production":
        raise RuntimeError(
            "AegisBrain Stage 0 is a local demo only. Do not deploy before workload authentication, "
            "tenant authorization, production database locking, and deployment hardening are implemented."
        )
    initialize_database()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0-stage0",
    description=(
        "Local Stage 0 proof of deterministic policy evaluation. This service is not production-ready "
        "and does not yet authenticate agent workloads."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(evaluate_router, prefix="/v1")
app.include_router(policies_router, prefix="/v1")
app.include_router(audit_router, prefix="/v1")


@app.get("/healthz", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="aegisbrain-gateway", environment=settings.app_env)
