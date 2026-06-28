"""Analytics API routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AgentRun, AuditLog, Event, EventStatus, Project
from app.db.session import get_db

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)) -> dict:
    """Return lightweight operational analytics for the dashboard."""

    events_total = await db.scalar(select(func.count(Event.id)))
    projects_total = await db.scalar(select(func.count(Project.id)))
    runs_total = await db.scalar(select(func.count(AgentRun.id)))
    errors_total = await db.scalar(select(func.count(AuditLog.id)).where(AuditLog.level == "ERROR"))
    ready_total = await db.scalar(select(func.count(Event.id)).where(Event.status == EventStatus.ready))
    return {
        "events_total": events_total or 0,
        "projects_total": projects_total or 0,
        "agent_runs_total": runs_total or 0,
        "errors_total": errors_total or 0,
        "ready_events_total": ready_total or 0,
    }
