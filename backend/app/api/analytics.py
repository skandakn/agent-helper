"""Analytics API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_optional_user_id
from app.db.models import AgentRun, AuditLog, Event, EventStatus, Project
from app.db.session import get_db

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
@router.get("/overview")
@router.get("/summary")
async def overview(
    user_id: int | None = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return lightweight operational analytics for the dashboard."""

    events_query = select(func.count(Event.id)).join(Project)
    projects_query = select(func.count(Project.id))
    runs_query = select(func.count(AgentRun.id)).join(Event).join(Project)
    errors_query = select(func.count(AuditLog.id)).join(Event, AuditLog.event_id == Event.id).join(Project).where(AuditLog.level == "ERROR")
    ready_query = select(func.count(Event.id)).join(Project).where(Event.status == EventStatus.ready)

    if user_id is not None:
        events_query = events_query.where(Project.user_id == user_id)
        projects_query = projects_query.where(Project.user_id == user_id)
        runs_query = runs_query.where(Project.user_id == user_id)
        errors_query = errors_query.where(Project.user_id == user_id)
        ready_query = ready_query.where(Project.user_id == user_id)

    events_total = await db.scalar(events_query)
    projects_total = await db.scalar(projects_query)
    runs_total = await db.scalar(runs_query)
    errors_total = await db.scalar(errors_query)
    ready_total = await db.scalar(ready_query)
    return {
        "events_total": events_total or 0,
        "projects_total": projects_total or 0,
        "agent_runs_total": runs_total or 0,
        "errors_total": errors_total or 0,
        "ready_events_total": ready_total or 0,
    }
