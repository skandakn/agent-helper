"""Async SQLAlchemy engine, migrations, and session management."""

from __future__ import annotations

import asyncio
import logging
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


async def get_db() -> AsyncIterator[AsyncSession]:
    """Yield an async database session for FastAPI dependencies."""

    async with async_session_factory() as session:
        yield session
