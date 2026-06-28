"""Main workflow orchestration service."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app.core.config import settings
from app.models.agent import AgentProgressEvent, LaunchPackage
from app.models.event import EventLaunchRequest
from app.services.agents import (
    compile_final_markdown,
    now_utc,
    run_branding_agent,
    run_content_agent,
    run_critic_agent,
    run_operations_agent,
    run_research_agent,
    run_social_media_agent,
    runtime_note,
)
from app.services.memory import remember

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[AgentProgressEvent], Awaitable[None]]
PersistCallback = Callable[[str, dict[str, Any], dict[str, Any], str, str | None], Awaitable[None]]


async def run_pipeline(
    event_brief: EventLaunchRequest,
    event_id: int,
    progress_callback: ProgressCallback | None = None,
    persist_callback: PersistCallback | None = None,
) -> LaunchPackage:
    """Run the full multi-agent workflow for a hackathon event."""

    async def emit(
        stage: str,
        pct: int,
        status: str,
        message: str,
        data: dict[str, Any] | None = None,
    ) -> None:
        event = AgentProgressEvent(
            event_id=event_id,
            stage=stage,
            pct=pct,
            status=status,  # type: ignore[arg-type]
            message=message,
            data=data or {},
        )
        if progress_callback:
            await progress_callback(event)

    async def persist(
        agent_name: str,
        input_data: dict[str, Any],
        output_data: dict[str, Any],
        status: str = "completed",
        error: str | None = None,
    ) -> None:
        if persist_callback:
            await persist_callback(agent_name, input_data, output_data, status, error)

    await emit("orchestrator", 2, "running", "Parsed brief and created workflow plan.")

    try:
        await emit("research", 8, "running", "Research agent is collecting context and sponsor angles.")
        research = await run_research_agent(event_brief)
        await persist("research", event_brief.model_dump(mode="json"), research.model_dump(mode="json"))
        await emit("research", 20, "completed", "Research summary ready.", {"research": research.model_dump(mode="json")})

        await emit("branding", 26, "running", "Branding agent is generating names and identity direction.")
        branding = await run_branding_agent(event_brief, research)
        await persist(
            "branding",
            {"brief": event_brief.model_dump(mode="json"), "research": research.model_dump(mode="json")},
            branding.model_dump(mode="json"),
        )
        await emit("branding", 38, "completed", "Brand system ready.", {"branding": branding.model_dump(mode="json")})

        await emit("content", 44, "running", "Content agent is drafting launch assets.")
        content = await run_content_agent(event_brief, research, branding)
        await persist(
            "content",
            {
                "brief": event_brief.model_dump(mode="json"),
                "research": research.model_dump(mode="json"),
                "branding": branding.model_dump(mode="json"),
            },
            content.model_dump(mode="json"),
        )
        await emit("content", 58, "completed", "Landing page, emails, and pitch outline ready.")

        await emit("social_media", 63, "running", "Social media agent is building the campaign calendar.")
        social_media = await run_social_media_agent(event_brief, branding, content)
        await persist(
            "social_media",
            {"brief": event_brief.model_dump(mode="json"), "branding": branding.model_dump(mode="json")},
            social_media.model_dump(mode="json"),
        )
        await emit(
            "social_media",
            72,
            "completed",
            "Social campaign ready.",
            {"social_media": social_media.model_dump(mode="json")},
        )

        await emit("operations", 78, "running", "Operations agent is creating timeline, tasks, and budget.")
        operations = await run_operations_agent(event_brief, research, branding)
        await persist(
            "operations",
            {"brief": event_brief.model_dump(mode="json"), "research": research.model_dump(mode="json")},
            operations.model_dump(mode="json"),
        )
        await emit("operations", 88, "completed", "Operations plan ready.", {"operations": operations.model_dump(mode="json")})

        await emit("critic", 92, "running", "Critic agent is reviewing consistency and actionability.")
        critique = await run_critic_agent(research, branding, content, social_media, operations)
        await persist(
            "critic",
            {
                "research": research.model_dump(mode="json"),
                "branding": branding.model_dump(mode="json"),
                "content": content.model_dump(mode="json"),
                "social_media": social_media.model_dump(mode="json"),
                "operations": operations.model_dump(mode="json"),
            },
            critique.model_dump(mode="json"),
        )

        if critique.refinement_required:
            await emit("refinement", 95, "running", "Applying critic fixes to the package.")
            previous_issues = list(critique.issues)
            content.landing_page.hero_headline = branding.selected_name
            critique = await run_critic_agent(research, branding, content, social_media, operations)
            await persist(
                "critic_refinement",
                {"previous_issues": previous_issues},
                critique.model_dump(mode="json"),
            )

        final_markdown = compile_final_markdown(
            event_brief,
            research,
            branding,
            content,
            social_media,
            operations,
            critique,
        )
        final_package = LaunchPackage(
            event_id=event_id,
            generated_at=now_utc(),
            runtime=settings.AGENT_RUNTIME,
            runtime_note=runtime_note(),
            research=research,
            branding=branding,
            content=content,
            social_media=social_media,
            operations=operations,
            critique=critique,
            final_markdown=final_markdown,
        )
        await remember(
            "event_templates",
            f"{branding.selected_name}: {branding.tagline}",
            {
                "event_id": event_id,
                "summary": f"{branding.selected_name}: {branding.tagline}",
                "theme": event_brief.theme,
                "name": branding.selected_name,
                "type": "final_package",
                "tags": [item.lower() for item in branding.tone],
                "overall_score": critique.overall,
            },
        )
        await persist(
            "orchestrator",
            event_brief.model_dump(mode="json"),
            final_package.model_dump(mode="json"),
        )
        await emit("done", 100, "completed", "Launch package ready.", final_package.model_dump(mode="json"))
        return final_package
    except Exception as exc:
        logger.exception("Pipeline failed for event %s", event_id)
        await persist("orchestrator", event_brief.model_dump(mode="json"), {}, "failed", str(exc))
        await emit("failed", 100, "failed", f"Workflow failed: {exc}")
        raise
