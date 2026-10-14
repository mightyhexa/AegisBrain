"""Application settings for the AegisBrain Deterministic Gateway (Phase 3).

Manages runtime configuration, environment variables, SQLite/PostgreSQL URLs,
CORS origins, and the development demo tenant identity.

Production safety:
The gateway refuses startup if APP_ENV=production until multi-tenant RLS,
managed identity, and downstream execution adapters are verified.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AegisBrain Gateway"
    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./aegisbrain.db"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    demo_tenant_id: str = "demo-tenant"
    hold_token_ttl_seconds: int = 300

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        """Parses CORS origins from either comma-separated or JSON array formats."""
        raw = self.cors_origins.strip()
        if raw.startswith("[") and raw.endswith("]"):
            raw = raw[1:-1]
        return [
            origin.strip().strip("'\"")
            for origin in raw.split(",")
            if origin.strip().strip("'\"")
        ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()