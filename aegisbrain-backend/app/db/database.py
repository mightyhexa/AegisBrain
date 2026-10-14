"""SQLAlchemy engine and session management (SQLite & Supabase PostgreSQL ready)."""

from __future__ import annotations

from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Declarative base class for all SQLAlchemy ORM models."""


def _normalize_db_url(url: str) -> str:
    """Normalizes Supabase PostgreSQL URLs to use the psycopg v3 driver."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


_db_url = _normalize_db_url(settings.database_url)
_is_sqlite = _db_url.startswith("sqlite")

_connect_args: dict[str, Any] = (
    {"check_same_thread": False, "timeout": 5} if _is_sqlite else {}
)

engine = create_engine(
    _db_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped database session per request."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()