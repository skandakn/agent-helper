"""Background task that runs and persists the multi-agent workflow."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import (
    AgentRun,
    AgentRunStatus,
    Asset,
    AuditLog,
    Campaign,
    Event,
    EventStatus,
    Task,
    TaskStatus,
)
from app.db.session import async_session_factory
from app.models.agent import AgentProgressEvent, LaunchPackage
from app.models.event import EventLaunchRequest
from app.services.orchestrator import run_pipeline
from app.ws import broadcast_progress


def _utc_now() -> datetime:
    """Return current UTC time."""

    return datetime.now(timezone.utc)


async def run_event_pipeline(event_id: int, orchestrator_run_id: int, brief_payload: dict[str, Any]) -> None:
    """Run an event workflow in a fresh database session."""

    brief = EventLaunchRequest.model_validate(brief_payload)
    async with async_session_factory() as db:
        event = await db.get(Event, event_id)
        run = await db.get(AgentRun, orchestrator_run_id)
        if event is None or run is None:
            return
        event.status = EventStatus.running
        run.status = AgentRunStatus.running
        run.started_at = _utc_now()
        await db.commit()

    async def on_progress(progress: AgentProgressEvent) -> None:
        await broadcast_progress(progress)

    async def persist_agent_run(
        agent_name: str,
        input_data: dict[str, Any],
        output_data: dict[str, Any],
        status: str,
        error: str | None,
    ) -> None:
        async with async_session_factory() as persist_db:
            if agent_name == "orchestrator":
                agent_run = await persist_db.get(AgentRun, orchestrator_run_id)
                if agent_run is None:
                    return
            else:
                agent_run = AgentRun(
                    agent_name=agent_name,
                    event_id=event_id,
                    input_data=input_data,
                    status=AgentRunStatus.running,
                    runtime=settings.effective_agent_runtime,
                    started_at=_utc_now(),
                )
                persist_db.add(agent_run)
                await persist_db.flush()
            agent_run.input_data = input_data
            agent_run.output_data = output_data
            agent_run.status = AgentRunStatus(status)
            agent_run.runtime = settings.effective_agent_runtime
            agent_run.completed_at = _utc_now() if status in {"completed", "failed"} else None
            agent_run.error = error
            persist_db.add(
                AuditLog(
                    agent_run_id=agent_run.id,
                    event_id=event_id,
                    message=f"{agent_name} {status}",
                    level="ERROR" if error else "INFO",
                    payload={"error": error} if error else {},
                )
            )
            await persist_db.commit()

    try:
        package = await run_pipeline(
            brief,
            event_id,
            progress_callback=on_progress,
            persist_callback=persist_agent_run,
        )
        async with async_session_factory() as db:
            event = await db.get(Event, event_id)
            if event is not None:
                event.status = EventStatus.ready
                event.final_package = package.model_dump(mode="json")
                await _hydrate_generated_entities(db, event_id, package)
            await db.commit()
    except Exception as exc:
        async with async_session_factory() as db:
            event = await db.get(Event, event_id)
            if event is not None:
                event.status = EventStatus.failed
                event.last_error = str(exc)
            run = await db.get(AgentRun, orchestrator_run_id)
            if run is not None:
                run.status = AgentRunStatus.failed
                run.error = str(exc)
                run.completed_at = _utc_now()
            db.add(AuditLog(event_id=event_id, agent_run_id=orchestrator_run_id, message=str(exc), level="ERROR"))
            await db.commit()


async def _hydrate_generated_entities(db: AsyncSession, event_id: int, package: LaunchPackage) -> None:
    """Persist campaigns, assets, and operations tasks from the final package."""

    await db.execute(delete(Task).where(Task.event_id == event_id))
    await db.execute(delete(Campaign).where(Campaign.event_id == event_id))

    campaign = Campaign(
        event_id=event_id,
        type="launch",
        name=package.social_media.campaign_name,
        metadata_json={"duration_weeks": package.social_media.duration_weeks},
    )
    db.add(campaign)
    await db.flush()

    db.add_all(
        [
            Asset(
                campaign_id=campaign.id,
                type="landing_page",
                title="Landing Page Copy",
                content_text=package.content.landing_page.model_dump_json(indent=2),
            ),
            Asset(
                campaign_id=campaign.id,
                type="sponsor_pitch_outline",
                title="Sponsor Pitch Outline",
                content_text="\n".join(slide.slide_title for slide in package.content.sponsor_pitch_outline),
            ),
            Asset(
                campaign_id=campaign.id,
                type="social_campaign",
                title=package.social_media.campaign_name,
                content_text=package.social_media.model_dump_json(indent=2),
            ),
        ]
    )
    db.add_all(
        [
            Task(
                event_id=event_id,
                description=item.description,
                assigned_to=item.owner,
                status=TaskStatus(item.status),
                metadata_json={"due_window": item.due_window},
            )
            for item in package.operations.tasks
        ]
    )
