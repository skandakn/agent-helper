"""Event and project API routes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_optional_user_id
from app.core.config import settings
from app.db.models import AgentRun, AgentRunStatus, AuditLog, Event, EventStatus, Project, User
from app.db.session import get_db
from app.models.event import (
    EventLaunchRequest,
    EventLaunchResponse,
    EventOutputUpdate,
    EventOutputResponse,
    EventRead,
    EventStatusResponse,
    ProjectRead,
)
from app.tasks.agent_runner import run_event_pipeline

router = APIRouter(tags=["events"])

STAGE_PCTS = {
    "research": 20,
    "branding": 38,
    "content": 58,
    "social_media": 72,
    "operations": 88,
    "critic": 94,
    "orchestrator": 100,
}


async def ensure_default_project(db: AsyncSession, user_id: int | None, project_id: int | None) -> Project:
    """Create or return a default MVP project."""

    if project_id:
        project = await db.get(Project, project_id)
        if project and (user_id is None or project.user_id == user_id):
            return project
    default_user_id = user_id or 1
    user = await db.get(User, default_user_id)
    if user is None:
        user = User(
            id=default_user_id,
            name="Local Organizer",
            email=f"local-organizer-{default_user_id}@example.com",
            preferences={"runtime": "mvp"},
        )
        db.add(user)
        await db.flush()
    project = Project(
        user_id=user.id,
        title="Hackathon Launches",
        description="Default local project for generated launch packages.",
    )
    db.add(project)
    await db.flush()
    return project


async def get_scoped_event(db: AsyncSession, event_id: int, user_id: int | None) -> Event:
    """Return an event only if it belongs to the current user when authenticated."""

    query = select(Event).where(Event.id == event_id)
    if user_id is not None:
        query = query.join(Project).where(Project.user_id == user_id)
    result = await db.execute(query)
    event = result.scalars().first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("/events/launch", response_model=EventLaunchResponse, status_code=status.HTTP_202_ACCEPTED)
async def launch_event(
    req: EventLaunchRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: int | None = Depends(get_optional_user_id),
) -> EventLaunchResponse:
    """Create an event and start the multi-agent launch workflow."""

    project = await ensure_default_project(db, user_id, req.project_id)
    event = Event(
        project_id=project.id,
        status=EventStatus.planning,
        brief=req.model_dump(mode="json"),
        venue=req.venue,
        date=req.date,
    )
    db.add(event)
    await db.flush()
    run = AgentRun(
        agent_name="orchestrator",
        event_id=event.id,
        input_data=req.model_dump(mode="json"),
        status=AgentRunStatus.pending,
        runtime=settings.effective_agent_runtime,
    )
    db.add(run)
    db.add(AuditLog(agent_run_id=run.id, event_id=event.id, message="Launch workflow queued"))
    await db.commit()
    await db.refresh(event)
    await db.refresh(run)

    background_tasks.add_task(run_event_pipeline, event.id, run.id, req.model_dump(mode="json"))
    scheme = "wss" if request.url.scheme == "https" else "ws"
    websocket_url = f"{scheme}://{request.url.netloc}/ws/{event.id}"
    return EventLaunchResponse(
        event_id=event.id,
        run_id=run.id,
        status=event.status.value,
        websocket_url=websocket_url,
    )


@router.get("/events/{event_id}/status", response_model=EventStatusResponse)
async def get_event_status(
    event_id: int,
    user_id: int | None = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
) -> EventStatusResponse:
    """Return event status and coarse progress inferred from completed runs."""

    event = await get_scoped_event(db, event_id, user_id)
    result = await db.execute(select(AgentRun).where(AgentRun.event_id == event_id))
    runs = result.scalars().all()
    progress: dict[str, Any] = {}
    for run in runs:
        if run.status == AgentRunStatus.completed:
            progress[run.agent_name] = 100
        elif run.status == AgentRunStatus.failed:
            progress[run.agent_name] = STAGE_PCTS.get(run.agent_name, 0)
    if event.status == EventStatus.ready:
        for stage in ("research", "branding", "content", "social_media", "operations", "critic"):
            progress[stage] = 100
        progress["done"] = 100
    return EventStatusResponse(
        event_id=event_id,
        status=event.status.value,
        updated_at=event.updated_at,
        last_error=event.last_error,
        progress=progress,
    )


@router.get("/events/{event_id}/output", response_model=EventOutputResponse)
async def get_event_output(
    event_id: int,
    user_id: int | None = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
) -> EventOutputResponse:
    """Return the final package if available."""

    event = await get_scoped_event(db, event_id, user_id)
    output: dict[str, Any] = event.final_package or {}
    if not output:
        result = await db.execute(
            select(AgentRun)
            .where(AgentRun.event_id == event_id, AgentRun.agent_name == "orchestrator")
            .order_by(desc(AgentRun.created_at))
        )
        run = result.scalars().first()
        output = run.output_data if run else {}
    return EventOutputResponse(event_id=event_id, status=event.status.value, output=output)


@router.patch("/events/{event_id}/output", response_model=EventOutputResponse)
async def update_event_output(
    event_id: int,
    payload: EventOutputUpdate,
    user_id: int | None = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
) -> EventOutputResponse:
    """Persist user edits to the generated package."""

    event = await get_scoped_event(db, event_id, user_id)
    output = dict(event.final_package or {})
    if payload.output is not None:
        output.update(payload.output)
    if payload.final_markdown is not None:
        output["final_markdown"] = payload.final_markdown
    event.final_package = output
    db.add(AuditLog(event_id=event_id, message="Generated package edited", payload={"fields": list(payload.model_dump(exclude_none=True))}))
    await db.commit()
    await db.refresh(event)
    return EventOutputResponse(event_id=event_id, status=event.status.value, output=event.final_package or {})


@router.get("/events/{event_id}", response_model=EventRead)
async def get_event(
    event_id: int,
    user_id: int | None = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
) -> Event:
    """Return an event record."""

    return await get_scoped_event(db, event_id, user_id)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: int,
    user_id: int | None = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an event owned by the current user."""

    event = await get_scoped_event(db, event_id, user_id)
    await db.delete(event)
    await db.commit()


@router.get("/projects", response_model=list[ProjectRead])
async def list_projects(db: AsyncSession = Depends(get_db), user_id: int | None = Depends(get_optional_user_id)) -> list[Project]:
    """Return projects and their events."""

    query = select(Project).options(selectinload(Project.events)).order_by(desc(Project.created_at))
    if user_id:
        query = query.where(Project.user_id == user_id)
    result = await db.execute(query)
    projects = list(result.scalars().unique().all())
    if not projects:
        project = await ensure_default_project(db, user_id, None)
        await db.commit()
        result = await db.execute(
            select(Project).options(selectinload(Project.events)).where(Project.id == project.id)
        )
        projects = list(result.scalars().unique().all())
    return projects


@router.get("/events", response_model=list[EventRead])
async def list_events(
    user_id: int | None = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[Event]:
    """Return recent events."""

    query = select(Event).join(Project).order_by(desc(Event.created_at)).limit(25)
    if user_id is not None:
        query = query.where(Project.user_id == user_id)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""

    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
