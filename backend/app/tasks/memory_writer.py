"""Helpers for recording memory writes in PostgreSQL."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MemoryRecord


async def record_memory(
    db: AsyncSession,
    collection: str,
    memory_id: str,
    summary: str,
    payload: dict,
    tags: list[str] | None = None,
) -> MemoryRecord:
    """Persist a searchable index row for a Qdrant/fallback memory point."""

    record = MemoryRecord(
        collection=collection,
        memory_id=memory_id,
        summary=summary,
        payload=payload,
        tags=tags or [],
    )
    db.add(record)
    await db.flush()
    return record
