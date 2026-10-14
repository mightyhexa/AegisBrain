"""FastAPI application entry point for the AegisBrain Policy Gateway."""

from __future__ import annotations

import logging
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

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        initialize_database()
    except Exception as exc:
        logger.warning("Database bootstrap skipped: %s", exc)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.4.0",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)

# Allow Netlify (*.netlify.app), Vercel (*.vercel.app), and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(evaluate_router, prefix="/v1")
app.include_router(policies_router, prefix="/v1")
app.include_router(policy_lifecycle_router, prefix="/v1")
app.include_router(holds_router, prefix="/v1")
app.include_router(audit_router, prefix="/v1")
app.include_router(real_integrations_router, prefix="/v1")


@app.get("/")
@app.get("/health")
@app.get("/healthz")
def healthz() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="aegisbrain-gateway",
        environment=settings.app_env,
    )
