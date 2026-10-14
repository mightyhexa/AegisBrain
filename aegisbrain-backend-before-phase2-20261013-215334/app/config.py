"""Application settings for the local Stage 0 demo.

This configuration is intentionally not production-ready: Stage 0 has no
workload authentication or tenant-bound authorization at the HTTP boundary.
The application refuses APP_ENV=production until those controls are built.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AegisBrain Gateway"
    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./aegisbrain.db"
    cors_origins: str = "http://localhost:3000"
    demo_tenant_id: str = "demo-tenant"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
