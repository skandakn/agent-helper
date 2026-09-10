"""Agent run and memory API routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_optional_auth_claims, get_request_user_id
from app.db.models import AgentRun, Event, Project
from app.db.session import get_db
from app.models.agent import AgentRunOutput
from app.services.memory import (
    COLLECTIONS,
    bootstrap_collections,
    bootstrap_report,
    list_points,
    memory_stats,
    search_memory,
    verify_fallback_parity,
)

router = APIRouter(tags=["agents"])


@router.get("/agents/{run_id}/output", response_model=AgentRunOutput)
async def get_agent_output(
    run_id: int,
    user_id: int = Depends(get_request_user_id),
    db: AsyncSession = Depends(get_db),
) -> AgentRun:
    """Return a single agent run output."""

    result = await db.execute(
        select(AgentRun)
        .join(Event, AgentRun.event_id == Event.id)
        .join(Project, Event.project_id == Project.id)
        .where(AgentRun.id == run_id, Project.user_id == user_id)
    )
    run = result.scalars().first()
    if run is None:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return run


@router.get("/agents", response_model=list[AgentRunOutput])
async def list_agent_runs(
    event_id: int | None = None,
    user_id: int = Depends(get_request_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[AgentRun]:
    """List recent agent runs, optionally by event."""

    query = (
        select(AgentRun)
        .join(Event, AgentRun.event_id == Event.id)
        .join(Project, Event.project_id == Project.id)
        .where(Project.user_id == user_id)
        .order_by(desc(AgentRun.created_at))
        .limit(100)
    )
    if event_id is not None:
        query = query.where(AgentRun.event_id == event_id)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/memory/search")
async def memory_search(
    query: str = Query(min_length=1),
    collection: str | None = None,
    top_k: int = Query(default=5, ge=1, le=20),
    _claims: dict[str, Any] | None = Depends(get_optional_auth_claims),
) -> dict:
    """Search long-term memory."""

    if collection and collection not in COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown collection: {collection}")
    results = await search_memory(query=query, top_k=top_k, collection=collection)
    return {"query": query, "collection": collection, "results": results}


@router.get("/memory/status")
async def memory_status(
    _claims: dict[str, Any] | None = Depends(get_optional_auth_claims),
) -> dict:
    """Which backend memory is really running on, and what is in it.

    A search returning nothing used to be indistinguishable from memory
    silently running on an empty in-process fallback.
    """

    return await memory_stats()


@router.get("/memory/bootstrap")
async def memory_bootstrap_report(
    _claims: dict[str, Any] | None = Depends(get_optional_auth_claims),
) -> dict:
    """The result of the last collection bootstrap."""

    return bootstrap_report()


@router.post("/memory/bootstrap")
async def rerun_memory_bootstrap(_user_id: int = Depends(get_request_user_id)) -> dict:
    """Re-run the bootstrap. Idempotent, and the way to recover a late Qdrant."""

    return await bootstrap_collections(force=True)


@router.get("/memory/points")
async def memory_points(
    collection: str = Query(...),
    limit: int = Query(default=20, ge=1, le=100),
    _claims: dict[str, Any] | None = Depends(get_optional_auth_claims),
) -> dict:
    """Raw stored records for one collection, for the inspector panel."""

    if collection not in COLLECTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown collection: {collection}")
    return await list_points(collection, limit=limit)


@router.post("/memory/parity")
async def memory_parity(_user_id: int = Depends(get_request_user_id)) -> dict:
    """Run the fallback parity self-test."""

    return await verify_fallback_parity()
