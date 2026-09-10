"""Main workflow orchestration service."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from app.core.config import settings
from app.models.agent import (
    AgentProgressEvent,
    BrandingOutput,
    ContentOutput,
    CriterionScore,
    LaunchPackage,
    OperationsOutput,
    RegenerationRecord,
    ResearchOutput,
    SocialMediaOutput,
)
from app.models.event import EventLaunchRequest
from app.services.agents import (
    REPAIRS,
    compile_final_markdown,
    now_utc,
    run_branding_agent,
    run_content_agent,
    run_critic_agent,
    run_operations_agent,
    run_research_agent,
    run_social_media_agent,
    repair_content,
    repair_operations,
    repair_social_media,
    runtime_note,
)
from app.services.memory import remember

logger = logging.getLogger(__name__)

#: The regeneration loop is deliberately bounded: one pass, at most two
#: targeted agents. An unbounded critic/regenerate loop can spend real money
#: oscillating between two outputs neither of which the rubric accepts, and a
#: workflow whose cost depends on how strict the critic feels is not
#: deployable. If one pass does not clear the rubric, the package ships with
#: its scores visible and the reasons attached.
MAX_REGENERATION_PASSES = 1
MAX_REGENERATION_TARGETS = 2

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

        if critique.refinement_required and MAX_REGENERATION_PASSES > 0:
            targets = critique.regeneration_targets()[:MAX_REGENERATION_TARGETS]
            weighted_before = critique.weighted_overall
            failing = critique.failing_criteria()

            if not targets:
                # Criteria failed but none named a fixable agent. Regenerating
                # blindly would be guessing, so record why nothing was retried.
                critique.regeneration = RegenerationRecord(
                    attempted=False,
                    max_passes=MAX_REGENERATION_PASSES,
                    triggered_by=[item.criterion for item in failing],
                    weighted_before=weighted_before,
                    weighted_after=weighted_before,
                    note="Failing criteria did not identify a regenerable agent.",
                )
            else:
                await emit(
                    "refinement",
                    95,
                    "running",
                    f"Critic scored {weighted_before:.1f}/10. Regenerating: {', '.join(targets)}.",
                )
                # Snapshot, so a pass that makes the package worse can be undone.
                snapshot = {
                    "content": content,
                    "social_media": social_media,
                    "operations": operations,
                }
                feedback_by_agent = _feedback_by_agent(failing)

                for target in targets:
                    content, social_media, operations = await _regenerate(
                        target,
                        event_brief,
                        research,
                        branding,
                        content,
                        social_media,
                        operations,
                        feedback_by_agent.get(target, []),
                    )

                recheck = await run_critic_agent(research, branding, content, social_media, operations)
                improved = recheck.weighted_overall >= weighted_before

                if not improved:
                    # Keep the better package rather than shipping a worse one
                    # just because a pass ran.
                    content = snapshot["content"]
                    social_media = snapshot["social_media"]
                    operations = snapshot["operations"]
                    logger.info(
                        "Regeneration lowered the score (%.2f -> %.2f); keeping the original package.",
                        weighted_before,
                        recheck.weighted_overall,
                    )

                record = RegenerationRecord(
                    attempted=True,
                    passes_used=1,
                    max_passes=MAX_REGENERATION_PASSES,
                    target_agents=targets,
                    triggered_by=[item.criterion for item in failing],
                    weighted_before=weighted_before,
                    weighted_after=recheck.weighted_overall,
                    improved=improved,
                    note=(
                        f"Regenerated {', '.join(targets)} from critic feedback."
                        if improved
                        else "Regenerated output scored no better; reverted to the original package."
                    ),
                )
                if improved:
                    critique = recheck
                critique.regeneration = record

                await persist(
                    "critic_refinement",
                    {
                        "targets": targets,
                        "triggered_by": record.triggered_by,
                        "feedback": feedback_by_agent,
                    },
                    critique.model_dump(mode="json"),
                )
                await emit(
                    "refinement",
                    96,
                    "completed",
                    record.note,
                    {"regeneration": record.model_dump(mode="json")},
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
            runtime=settings.effective_agent_runtime,
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


def _feedback_by_agent(failing: list[CriterionScore]) -> dict[str, list[str]]:
    """Group failing criteria into per-agent feedback lines."""

    grouped: dict[str, list[str]] = {}
    for item in failing:
        for agent in item.target_agents:
            lines = grouped.setdefault(agent, [])
            lines.append(f"{item.criterion} scored {item.score}/10: {item.reason}")
            lines.extend(item.evidence)
    return grouped


async def _regenerate(
    target: str,
    event_brief: EventLaunchRequest,
    research: ResearchOutput,
    branding: BrandingOutput,
    content: ContentOutput,
    social_media: SocialMediaOutput,
    operations: OperationsOutput,
    feedback: list[str],
) -> tuple[ContentOutput, SocialMediaOutput, OperationsOutput]:
    """Re-run one agent with the critic's feedback attached.

    Under the Gemini runtime the feedback goes into the prompt and the agent
    genuinely regenerates. Under the deterministic runtime re-running produces
    identical output, so the named repairs are applied instead — which is why
    only the agents in `REPAIRS` are worth targeting there.
    """

    if target == "content":
        regenerated = await run_content_agent(event_brief, research, branding, feedback=feedback)
        if regenerated == content and "content" in REPAIRS:
            regenerated = repair_content(content, branding)
        return regenerated, social_media, operations

    if target == "social_media":
        regenerated = await run_social_media_agent(event_brief, branding, content, feedback=feedback)
        if regenerated == social_media and "social_media" in REPAIRS:
            regenerated = repair_social_media(social_media, branding)
        return content, regenerated, operations

    if target == "operations":
        regenerated = await run_operations_agent(event_brief, research, branding, feedback=feedback)
        if regenerated == operations and "operations" in REPAIRS:
            regenerated = repair_operations(operations)
        return content, social_media, regenerated

    logger.info("No regeneration path for target '%s'; leaving it unchanged.", target)
    return content, social_media, operations
