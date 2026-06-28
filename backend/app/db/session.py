"""Async SQLAlchemy engine and session management."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.models import Base

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


async def init_db() -> None:
    """Create database tables for the MVP.

    Production deployments can swap this for Alembic migrations; the model layer
    is intentionally migration-ready.
    """

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Yield an async database session for FastAPI dependencies."""

    async with async_session_factory() as session:
        yield session
