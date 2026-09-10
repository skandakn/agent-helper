"""Async SQLAlchemy engine, migrations, and session management."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.models import Base

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.POSTGRES_URL,
    pool_pre_ping=True,
    echo=settings.APP_ENV == "test",
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


def _migration_config():
    """Return Alembic config with paths resolved for Docker, Render, and CI."""

    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.POSTGRES_URL)
    return config


async def _schema_tables() -> set[str]:
    """Return currently visible database table names."""

    async with engine.connect() as conn:
        return await conn.run_sync(lambda sync_conn: set(inspect(sync_conn).get_table_names()))


def _run_alembic(stamp_existing_schema: bool) -> None:
    """Run or stamp Alembic migrations from a worker thread."""

    from alembic import command

    config = _migration_config()
    if stamp_existing_schema:
        logger.info("Existing schema detected without alembic_version; stamping head")
        command.stamp(config, "head")
        return
    command.upgrade(config, "head")


async def run_migrations() -> None:
    """Apply Alembic migrations, safely handling earlier create_all databases."""

    tables = await _schema_tables()
    user_tables = tables - {"alembic_version"}
    stamp_existing_schema = bool(user_tables) and "alembic_version" not in tables
    await asyncio.to_thread(_run_alembic, stamp_existing_schema)


async def init_db() -> None:
    """Initialize schema using migrations or local demo table creation."""

    if settings.RUN_MIGRATIONS_ON_STARTUP:
        await run_migrations()

    if not settings.AUTO_CREATE_TABLES:
        return

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def check_database(timeout_seconds: float = 3.0) -> tuple[bool, float, str]:
    """Probe the database with a bounded ``SELECT 1``.

    Returns ``(reachable, latency_ms, detail)``. Never raises: the health
    endpoint has to answer even when Postgres is gone.
    """

    from sqlalchemy import text

    started = time.perf_counter()
    try:
        async with asyncio.timeout(timeout_seconds):
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        return True, (time.perf_counter() - started) * 1000, engine.url.get_backend_name()
    except TimeoutError:
        return False, (time.perf_counter() - started) * 1000, f"No response within {timeout_seconds}s."
    except Exception as exc:  # pragma: no cover - depends on deployment state
        logger.warning("Database health probe failed: %s", exc)
        return False, (time.perf_counter() - started) * 1000, str(exc)[:200]


async def get_db() -> AsyncIterator[AsyncSession]:
    """Yield an async database session for FastAPI dependencies."""

    async with async_session_factory() as session:
        yield session
