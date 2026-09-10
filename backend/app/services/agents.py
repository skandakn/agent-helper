"""Agent implementations with narrow jobs and strict structured outputs."""

from __future__ import annotations

import logging
import re
import math
from datetime import datetime, timezone

from app.core.config import settings
from app.models.agent import (
    CRITIC_RUBRIC,
    BrandNameOption,
    BrandingOutput,
    BudgetLineItem,
    CompetitorEvent,
    ContentOutput,
    CriterionScore,
    CriticReviewOutput,
    EmailDraft,
    LandingPageCopy,
    MemoryReference,
    OperationsOutput,
    OperationsTask,
    PaletteColor,
    ResearchOutput,
    SocialMediaOutput,
    SocialPost,
    SponsorPitchSection,
    SponsorTarget,
    TimelineItem,
)
from app.models.event import EventLaunchRequest
from app.services.adk_runtime import AgentSpec, maybe_generate_json_with_gemini
from app.services import prompts
from app.services.memory import recall, remember

logger = logging.getLogger(__name__)


MODEL_BY_TIER = {"pro": settings.GEMINI_PRO_MODEL, "flash": settings.GEMINI_FLASH_MODEL}


def spec_for(
    name: str,
    reads_memory: list[str],
    writes_memory: list[str],
) -> AgentSpec:
    """Build an AgentSpec whose instruction comes from the prompt template.

    The instruction used to be a Python literal on the spec. Reading it from
    the template means editing a prompt file (or the prompt studio) changes
    what the agent is actually told, with no code change and no redeploy.
    A template that fails to load falls back to a minimal instruction rather
    than taking the pipeline down.
    """

    try:
        template = prompts.load(name)
        instruction = template.system
        model_name = MODEL_BY_TIER.get(template.model, settings.GEMINI_FLASH_MODEL)
    except prompts.PromptError as exc:
        logger.warning("Prompt template '%s' unavailable (%s); using minimal instruction.", name, exc)
        instruction = f"You are the {name} agent in a hackathon launch pipeline."
        model_name = settings.GEMINI_FLASH_MODEL
    return AgentSpec(
        name=name,
        model_name=model_name,
        instruction=instruction,
        reads_memory=reads_memory,
        writes_memory=writes_memory,
    )


AGENT_MEMORY_SCOPES: dict[str, tuple[list[str], list[str]]] = {
    "research": (["event_templates", "sponsor_templates"], ["event_templates", "sponsor_templates"]),
    "branding": (["event_templates", "campaign_history"], ["marketing_assets"]),
    "content": (["marketing_assets"], ["marketing_assets"]),
    "social_media": (["campaign_history", "marketing_assets"], ["campaign_history"]),
    "operations": (["event_templates", "campaign_history"], ["event_templates"]),
    "critic": ([], []),
}


def _spec(name: str) -> AgentSpec:
    reads, writes = AGENT_MEMORY_SCOPES.get(name, ([], []))
    return spec_for(name, reads, writes)


def _feedback_block(feedback: list[str]) -> str:
    """Append critic feedback to a rendered prompt.

    Kept out of the templates so a regeneration pass needs no template change
    and strict rendering never has to tolerate an optional placeholder.
    """

    lines = "\n".join(f"- {item}" for item in feedback)
    return (
        "A reviewer rejected your previous output for this brief. "
        "Produce a new version that fixes every point below; change nothing else.\n"
        f"{lines}"
    )


def _render_user_prompt(name: str, variables: dict[str, object]) -> str:
    """Render an agent's user prompt, degrading to a summary line on failure."""

    try:
        _, user = prompts.render(name, variables)
        return user
    except prompts.PromptError as exc:
        logger.warning("Prompt render failed for '%s' (%s); using compact prompt.", name, exc)
        return "; ".join(f"{key}={value}" for key, value in variables.items())


async def _memory_context(collection: str, query: str, top_k: int = 3) -> str:
    """Render retrieved memories as prompt-ready text."""

    rows = await recall(collection, query, top_k=top_k)
    if not rows:
        return "(no prior events matched this theme)"
    return "\n".join(
        f"- {row.get('payload', {}).get('summary', 'memory')} (score {row.get('score', 0):.2f})"
        for row in rows
    )


def _keyword_tokens(text: str) -> list[str]:
    """Return stable human-readable keywords from a brief."""

    stopwords = {
        "the",
        "and",
        "for",
        "with",
        "hackathon",
        "event",
        "build",
        "create",
        "from",
        "that",
        "this",
        "into",
        "using",
        "about",
    }
    tokens = [token.lower() for token in re.findall(r"[A-Za-z0-9]+", text)]
    unique: list[str] = []
    for token in tokens:
        if token in stopwords or len(token) < 3 or token in unique:
            continue
        unique.append(token)
    return unique[:6] or ["innovation"]


def _title(text: str) -> str:
    """Convert a short phrase to title case with sensible fallback."""

    cleaned = re.sub(r"\s+", " ", text).strip()
    return cleaned.title() if cleaned else "Innovation"


def _primary_theme(brief: EventLaunchRequest) -> str:
    """Return a compact theme label."""

    tokens = _keyword_tokens(brief.theme)
    return " ".join(tokens[:3]).title()


def _memory_refs(collection: str, rows: list[dict]) -> list[MemoryReference]:
    """Convert memory search rows into contract-safe references."""

    refs: list[MemoryReference] = []
    for row in rows:
        payload = row.get("payload", {})
        refs.append(
            MemoryReference(
                collection=collection,
                memory_id=str(row.get("id", "unknown")),
                score=max(0.0, min(1.0, float(row.get("score", 0.0)))),
                summary=str(payload.get("summary") or payload.get("name") or payload)[:500],
            )
        )
    return refs


async def run_research_agent(brief: EventLaunchRequest) -> ResearchOutput:
    """Run the Research agent."""

    memory_context = await _memory_context("event_templates", brief.theme)
    prompt = _render_user_prompt(
        "research",
        {
            "theme": brief.theme,
            "goals": brief.goals,
            "audience": brief.audience,
            "memory_context": memory_context,
        },
    )
    generated = await maybe_generate_json_with_gemini(_spec("research"), prompt, ResearchOutput)
    if generated is not None:
        return generated

    theme = _primary_theme(brief)
    tokens = _keyword_tokens(f"{brief.theme} {brief.goals} {brief.audience}")
    event_memories = await recall("event_templates", brief.theme, top_k=3)
    sponsor_memories = await recall("sponsor_templates", brief.theme, top_k=2)
    sponsor_targets = [
        SponsorTarget(
            name=f"{theme} Industry Council",
            sector="Industry association",
            rationale=f"Likely to support a visible talent and prototype pipeline around {theme}.",
            pitch_angle="Position sponsorship as direct access to builders, mentors, and early prototypes.",
        ),
        SponsorTarget(
            name=f"{_title(tokens[0])} Cloud Partners",
            sector="Technology",
            rationale="Technical sponsors can provide credits, workshops, APIs, and mentor support.",
            pitch_angle="Offer branded challenge tracks and office-hours for developer adoption.",
        ),
        SponsorTarget(
            name=f"{_title(tokens[-1])} Civic Lab",
            sector="Public impact",
            rationale="Mission-aligned organizations can contribute datasets, problem statements, and judges.",
            pitch_angle="Frame the event as a measurable community innovation program.",
        ),
    ]
    output = ResearchOutput(
        summary=(
            f"{theme} is positioned as a practical builder-focused hackathon for {brief.audience}. "
            "The launch should emphasize applied outcomes, credible mentors, useful datasets, and a clear "
            "path from prototype to post-event adoption."
        ),
        audience_insights=[
            f"{brief.audience} will respond to specific challenge tracks and visible demo opportunities.",
            "Participants need clear judging criteria before registration so they can evaluate fit quickly.",
            "Sponsors need evidence that the event creates talent access and reusable project artifacts.",
            "Judges and mentors should be recruited early because their credibility lifts conversion.",
        ],
        trends=[
            f"Applied {tokens[0]} innovation is strongest when paired with real datasets and user interviews.",
            "Hybrid hackathons convert better when online participants have equal access to mentors.",
            "Post-event incubation is increasingly expected by sponsors and serious teams.",
            "Short-form launch content should show concrete problems, not generic innovation language.",
        ],
        competitors=[
            CompetitorEvent(
                name=f"{theme} Challenge",
                lesson="Challenge-led positioning creates urgency but can feel narrow.",
                differentiation="Use multiple tracks so teams can choose technical, design, or policy angles.",
            ),
            CompetitorEvent(
                name=f"{_title(tokens[0])} Sprint Weekend",
                lesson="Weekend events work when prep materials are available before kickoff.",
                differentiation="Publish starter kits and sponsor office-hour slots before applications close.",
            ),
        ],
        sponsor_targets=sponsor_targets,
        risks=[
            "Broad theme may dilute participant understanding unless tracks are named plainly.",
            "Sponsor pitch can become generic if outcomes are not tied to measurable deliverables.",
            "Operational scope may exceed team capacity without a clear owner map.",
            "Generated content must be checked for regional claims before publication.",
        ],
        recommended_positioning=(
            f"A practical {theme} launch program where teams build demo-ready solutions with expert support "
            "and a post-event path for the strongest projects."
        ),
        memory_used=_memory_refs("event_templates", event_memories)
        + _memory_refs("sponsor_templates", sponsor_memories),
        confidence=0.78 if event_memories or sponsor_memories else 0.66,
    )
    await remember(
        "event_templates",
        output.summary,
        {
            "summary": output.summary,
            "theme": brief.theme,
            "tags": tokens,
            "type": "research_summary",
        },
    )
    for sponsor in sponsor_targets:
        await remember(
            "sponsor_templates",
            sponsor.model_dump_json(),
            {
                "summary": sponsor.rationale,
                "sector": sponsor.sector,
                "industry": sponsor.sector,
                "sponsor": sponsor.name,
            },
        )
    return output


async def run_branding_agent(
    brief: EventLaunchRequest,
    research: ResearchOutput,
) -> BrandingOutput:
    """Run the Branding agent."""

    prompt = _render_user_prompt(
        "branding",
        {
            "theme": brief.theme,
            "research_summary": research.summary,
            "positioning": research.recommended_positioning,
            "tone_hint": ", ".join(research.trends[:3]),
        },
    )
    generated = await maybe_generate_json_with_gemini(_spec("branding"), prompt, BrandingOutput)
    if generated is not None:
        return generated

    theme = _primary_theme(brief)
    tokens = _keyword_tokens(brief.theme)
    memories = await recall("event_templates", f"{brief.theme} branding naming", top_k=3)
    base = _title(tokens[0])
    options = [
        BrandNameOption(
            name=f"{base} Forge",
            rationale="Signals hands-on making and a focused weekend build culture.",
            score=9,
        ),
        BrandNameOption(
            name=f"{theme} Lab",
            rationale="Works well for sponsor-safe professional positioning and demo-day credibility.",
            score=8,
        ),
        BrandNameOption(
            name=f"{base} Catalyst",
            rationale="Emphasizes acceleration, partnerships, and post-event momentum.",
            score=8,
        ),
    ]
    selected = options[0].name
    output = BrandingOutput(
        name_options=options,
        selected_name=selected,
        tagline=f"Build practical solutions for {theme.lower()} in one focused sprint.",
        tone=["credible", "energetic", "builder-first", "outcome-driven"],
        palette=[
            PaletteColor(name="Ink", hex="#172026", usage="Primary text and navigation"),
            PaletteColor(name="Signal Teal", hex="#0F8B8D", usage="Primary actions and progress states"),
            PaletteColor(name="Warm Coral", hex="#F25F5C", usage="Highlights, alerts, and social emphasis"),
            PaletteColor(name="Field Gold", hex="#F2C14E", usage="Sponsor and award moments"),
            PaletteColor(name="Mist", hex="#F5F7FA", usage="Page background and quiet surfaces"),
        ],
        typography_direction=(
            "Use a compact geometric sans for UI clarity, paired with a confident display sans for campaign "
            "headlines. Keep body copy dense and scannable."
        ),
        logo_concepts=[
            f"Wordmark with a modular spark built from the first letter of {base}.",
            "Badge system for challenge tracks using simple line icons and the coral accent.",
            "Demo-day lockup that combines the wordmark with a timestamp ribbon.",
        ],
        naming_guardrails=[
            "Avoid vague words such as summit, future, and innovation unless paired with a concrete domain.",
            "Check sponsor names and local event calendars before public launch.",
        ],
        memory_checks=_memory_refs("event_templates", memories),
    )
    await remember(
        "marketing_assets",
        f"{output.selected_name}: {output.tagline}",
        {
            "summary": f"{output.selected_name}: {output.tagline}",
            "asset_type": "branding",
            "medium": "brand_system",
            "name": output.selected_name,
        },
    )
    return output


async def run_content_agent(
    brief: EventLaunchRequest,
    research: ResearchOutput,
    branding: BrandingOutput,
    feedback: list[str] | None = None,
) -> ContentOutput:
    """Run the Content agent, optionally regenerating against critic feedback."""

    prompt = _render_user_prompt(
        "content",
        {
            "event_name": branding.selected_name,
            "tagline": branding.tagline,
            "theme": brief.theme,
            "audience": brief.audience,
            "goals": brief.goals,
        },
    )
    if feedback:
        prompt = f"{prompt}\n\n{_feedback_block(feedback)}"
    generated = await maybe_generate_json_with_gemini(_spec("content"), prompt, ContentOutput)
    if generated is not None:
        return generated

    memories = await recall("marketing_assets", f"{branding.selected_name} landing outreach sponsor", top_k=3)
    name = branding.selected_name
    landing = LandingPageCopy(
        hero_headline=name,
        subheadline=(
            f"{branding.tagline} Join builders, mentors, and sponsors for a {brief.constraints.duration_days}-day "
            "sprint from problem framing to demo-ready prototypes."
        ),
        primary_cta="Apply to build",
        secondary_cta="Download sponsor brief",
        sections=[
            {
                "title": "Why This Theme",
                "body": (
                    f"{research.recommended_positioning} The campaign should make the problem feel specific, "
                    "show why the timing matters, and connect participants to practical datasets, mentors, and pilots."
                ),
            },
            {
                "title": "Who Should Join",
                "body": (
                    f"Designed for {brief.audience}, including technical, design, product, and domain experts. "
                    "Solo applicants can join team formation, while pre-formed teams can enter with a clear problem angle."
                ),
            },
            {
                "title": "What Teams Build",
                "body": (
                    "Teams ship a working prototype, a short demo video, a lightweight impact case, and a roadmap "
                    "for real-world validation after demo day."
                ),
            },
            {
                "title": "Sponsor Value",
                "body": (
                    "Sponsors receive challenge visibility, mentor touchpoints, recruiting access, demo-day presence, "
                    "and a post-event report summarizing teams, prototypes, and follow-up opportunities."
                ),
            },
            {
                "title": "Challenge Tracks",
                "body": (
                    "Use three tracks: problem discovery, prototype build, and adoption planning. This keeps the "
                    "brief accessible for beginners while still giving advanced teams enough depth."
                ),
            },
            {
                "title": "What Happens After",
                "body": (
                    "Winning teams enter a follow-up pathway with mentor check-ins, sponsor introductions, pilot "
                    "readiness support, and a public recap that keeps momentum alive after the event."
                ),
            },
        ],
        faq=[
            {"question": "Do I need a team?", "answer": "No. Solo applicants can join team formation at kickoff."},
            {"question": "What should teams submit?", "answer": "A prototype, demo narrative, impact case, and next-step plan."},
            {"question": "Is the event beginner friendly?", "answer": "Yes, tracks include starter prompts and mentor support."},
            {"question": "Can sponsors propose challenges?", "answer": "Yes, sponsor challenge prompts are reviewed for fairness and clarity."},
            {"question": "How are winners selected?", "answer": "Judges score teams on problem relevance, prototype execution, feasibility, impact, and presentation clarity."},
            {"question": "What support is available after demo day?", "answer": "Selected teams receive follow-up mentor sessions, sponsor introductions, and pilot planning guidance."},
        ],
    )
    emails = [
        EmailDraft(
            audience="participants",
            subject=f"Apply for {name}: build something useful in one focused sprint",
            preview_text="A practical hackathon for builders who want their prototypes to matter.",
            body=(
                f"{name} is open for applications. Bring your technical, product, design, or domain skills and "
                f"work on {brief.theme}. You will get clear challenge tracks, mentor access, and a demo-day path."
            ),
            call_to_action="Apply now",
        ),
        EmailDraft(
            audience="sponsors",
            subject=f"Sponsor {name}: meet builders solving {brief.theme}",
            preview_text="A high-signal way to support talent, prototypes, and community outcomes.",
            body=(
                f"We are inviting a small group of sponsors to support {name}. Sponsorship includes branded "
                "challenge visibility, mentor participation, recruiting access, and demo-day recognition."
            ),
            call_to_action="Schedule a sponsor call",
        ),
        EmailDraft(
            audience="judges",
            subject=f"Judge {name}: help select prototypes with real execution potential",
            preview_text="We are assembling a focused judging panel for demo day.",
            body=(
                "Judges will review projects for relevance, execution, feasibility, and presentation clarity. "
                "We provide a structured rubric and a short briefing before demos."
            ),
            call_to_action="Confirm judging interest",
        ),
        EmailDraft(
            audience="partners",
            subject=f"Partner with {name}: help teams move from demo to adoption",
            preview_text="A practical way to support builders, mentors, and real-world implementation.",
            body=(
                f"We are inviting community and ecosystem partners for {name}. Partners can contribute datasets, "
                "problem statements, mentors, judging support, pilot pathways, or distribution to relevant builder communities."
            ),
            call_to_action="Discuss partnership fit",
        ),
    ]
    output = ContentOutput(
        landing_page=landing,
        outreach_emails=emails,
        sponsor_pitch_outline=[
            SponsorPitchSection(
                slide_title="Opening",
                objective="Introduce the event and domain opportunity.",
                talking_points=[name, branding.tagline, research.summary],
            ),
            SponsorPitchSection(
                slide_title="Audience",
                objective="Show who sponsors will reach.",
                talking_points=research.audience_insights[:3],
            ),
            SponsorPitchSection(
                slide_title="Challenge Tracks",
                objective="Translate the theme into sponsor-ready tracks.",
                talking_points=[
                    "Problem framing track",
                    "Prototype build track",
                    "Adoption and impact track",
                ],
            ),
            SponsorPitchSection(
                slide_title="Sponsor Benefits",
                objective="Clarify concrete value.",
                talking_points=[
                    "Brand visibility across launch assets",
                    "Mentor and workshop opportunities",
                    "Recruiting and community access",
                ],
            ),
            SponsorPitchSection(
                slide_title="Execution Plan",
                objective="Prove the team can deliver.",
                talking_points=[
                    "Clear timeline",
                    "Named owners",
                    "Structured judging and demo format",
                ],
            ),
            SponsorPitchSection(
                slide_title="Impact and Measurement",
                objective="Show how the event will prove value after demo day.",
                talking_points=[
                    "Prototype count and completion rate",
                    "Mentor engagement and team follow-ups",
                    "Sponsor report with project highlights and next-step opportunities",
                ],
            ),
            SponsorPitchSection(
                slide_title="Packages and Next Steps",
                objective="Move sponsors to action.",
                talking_points=[
                    "Lead sponsor",
                    "Track sponsor",
                    "Community partner",
                ],
            ),
            SponsorPitchSection(
                slide_title="Risk Controls",
                objective="Make sponsors confident the program is responsibly managed.",
                talking_points=[
                    "Clear eligibility and judging rules",
                    "Human review of all public claims",
                    "Backup operations plan for submissions, streaming, and communications",
                ],
            ),
        ],
        judging_rubric=[
            {"criterion": "Problem relevance", "weight": "25%", "description": "Addresses a meaningful theme-specific need."},
            {"criterion": "Prototype execution", "weight": "30%", "description": "Shows working functionality or convincing proof of concept."},
            {"criterion": "Feasibility", "weight": "20%", "description": "Can be piloted after the event with realistic resources."},
            {"criterion": "Impact narrative", "weight": "15%", "description": "Explains who benefits and how success would be measured."},
            {"criterion": "Presentation clarity", "weight": "10%", "description": "Communicates the solution quickly and honestly."},
            {"criterion": "Data or user grounding", "weight": "bonus", "description": "Uses real context, interviews, datasets, or field evidence to reduce guesswork."},
            {"criterion": "Post-event readiness", "weight": "bonus", "description": "Identifies owners, blockers, and next steps for continuing beyond demo day."},
        ],
        risk_narrative=(
            "The main launch risk is overpromising the event scope. Keep sponsor claims tied to specific benefits, "
            "publish a clear participant brief, and make the operational timeline visible before applications open."
        ),
        reusable_assets=[
            {"type": "hero_copy", "title": "Landing hero", "content": landing.subheadline},
            {"type": "email_subject", "title": "Participant invite", "content": emails[0].subject},
            {"type": "rubric", "title": "Judging rubric", "content": "Five-part rubric for demo day."},
            {"type": "sponsor_report", "title": "Post-event sponsor report outline", "content": "Summarize team count, prototype themes, mentor engagement, winners, and follow-up asks."},
            {"type": "participant_brief", "title": "Team starter brief", "content": "Explain tracks, required submissions, judging rubric, demo format, and support channels."},
        ],
        memory_used=_memory_refs("marketing_assets", memories),
    )
    await remember(
        "marketing_assets",
        output.landing_page.subheadline,
        {
            "summary": f"Landing page and outreach copy for {name}",
            "asset_type": "landing_page",
            "medium": "web",
            "name": name,
        },
    )
    return output


async def run_social_media_agent(
    brief: EventLaunchRequest,
    branding: BrandingOutput,
    content: ContentOutput,
    feedback: list[str] | None = None,
) -> SocialMediaOutput:
    """Run the Social Media agent, optionally regenerating against feedback."""

    prompt = _render_user_prompt(
        "social_media",
        {
            "event_name": branding.selected_name,
            "tagline": branding.tagline,
            "duration_weeks": 4,
            "audience": brief.audience,
        },
    )
    if feedback:
        prompt = f"{prompt}\n\n{_feedback_block(feedback)}"
    generated = await maybe_generate_json_with_gemini(_spec("social_media"), prompt, SocialMediaOutput)
    if generated is not None:
        return generated

    name = branding.selected_name
    theme_tag = re.sub(r"[^A-Za-z0-9]", "", _primary_theme(brief))[:28] or "Hackathon"
    campaign_weeks = max(1, min(104, math.ceil(brief.constraints.duration_days / 7)))
    middle_week = max(1, min(campaign_weeks, math.ceil(campaign_weeks / 2)))
    late_week = max(1, min(campaign_weeks, campaign_weeks - 1))
    posts = [
        SocialPost(
            week=1,
            channel="LinkedIn",
            objective="Launch announcement",
            text=f"{name} is now open. We are bringing builders together to work on {brief.theme}.",
            hashtags=[f"#{theme_tag}", "#Hackathon", "#Builders"],
        ),
        SocialPost(
            week=1,
            channel="X",
            objective="Fast awareness",
            text=f"Applications are open for {name}. Build, demo, and meet mentors in {brief.constraints.duration_days} days.",
            hashtags=[f"#{theme_tag}", "#BuildInPublic"],
        ),
        SocialPost(
            week=middle_week,
            channel="Instagram",
            objective="Explain who should apply",
            text=f"Designers, developers, researchers, and product thinkers: {name} has a track for you.",
            hashtags=[f"#{theme_tag}", "#StudentBuilders"],
        ),
        SocialPost(
            week=middle_week,
            channel="LinkedIn",
            objective="Sponsor credibility",
            text=f"Sponsors of {name} support a practical prototype pipeline, not a one-off logo placement.",
            hashtags=[f"#{theme_tag}", "#InnovationPrograms"],
        ),
        SocialPost(
            week=middle_week,
            channel="Instagram",
            objective="Mentor proof",
            text=f"Meet the mentors helping teams turn {brief.theme} ideas into testable demos and next-step plans.",
            hashtags=[f"#{theme_tag}", "#Mentorship", "#DemoReady"],
        ),
        SocialPost(
            week=late_week,
            channel="LinkedIn",
            objective="Rubric clarity",
            text=f"{name} teams will be judged on relevance, execution, feasibility, impact, and clarity. Build with the rubric in mind.",
            hashtags=[f"#{theme_tag}", "#HackathonTips", "#DemoDay"],
        ),
        SocialPost(
            week=late_week,
            channel="X",
            objective="Application urgency",
            text=f"Last call for {name}. Bring a problem, a skill, or just the curiosity to build.",
            hashtags=[f"#{theme_tag}", "#HackathonDeadline"],
        ),
        SocialPost(
            week=campaign_weeks,
            channel="Instagram",
            objective="Demo-day preview",
            text=f"Demo day is where {name} teams show what they learned, built, tested, and want to pilot next.",
            hashtags=[f"#{theme_tag}", "#DemoDay", "#Prototype"],
        ),
        SocialPost(
            week=campaign_weeks,
            channel="LinkedIn",
            objective="Demo-day momentum",
            text=f"{name} demo day will spotlight prototypes with practical next steps and measurable impact.",
            hashtags=[f"#{theme_tag}", "#DemoDay"],
        ),
    ]
    output = SocialMediaOutput(
        campaign_name=f"{name} Launch Sprint",
        duration_weeks=campaign_weeks,
        cadence="Three posts per week: one credibility post, one applicant-focused post, one sponsor/community post.",
        posts=posts,
        creative_direction=[
            "Use founder-style build notes rather than generic poster copy.",
            "Rotate between participant stories, mentor credibility, and challenge-track clarity.",
            "Keep every post anchored to one action: apply, sponsor, judge, or share.",
            "Create one reusable carousel template for track explainer posts, mentor quotes, and demo-day reminders.",
            "Use short videos for walkthroughs: problem statement, team formation, submission process, and judging criteria.",
        ],
        memory_write_summary=f"{campaign_weeks}-week campaign pattern for {name} with LinkedIn, X, and Instagram posts.",
    )
    await remember(
        "campaign_history",
        output.memory_write_summary,
        {
            "summary": output.memory_write_summary,
            "event_id": "pending",
            "medium": "social",
            "asset_type": "campaign_plan",
        },
    )
    return output


async def run_operations_agent(
    brief: EventLaunchRequest,
    research: ResearchOutput,
    branding: BrandingOutput,
    feedback: list[str] | None = None,
) -> OperationsOutput:
    """Run the Operations agent, optionally regenerating against feedback."""

    prompt = _render_user_prompt(
        "operations",
        {
            "event_name": branding.selected_name,
            "theme": brief.theme,
            "constraints": brief.constraints.model_dump_json(),
            "duration_days": brief.constraints.duration_days,
        },
    )
    if feedback:
        prompt = f"{prompt}\n\n{_feedback_block(feedback)}"
    generated = await maybe_generate_json_with_gemini(_spec("operations"), prompt, OperationsOutput)
    if generated is not None:
        return generated

    budget = float(brief.constraints.budget or 50000)
    duration_days = max(1, brief.constraints.duration_days)
    prep_window = max(56, min(730, duration_days))
    sponsor_due = max(42, round(prep_window * 0.75))
    application_due = max(28, round(prep_window * 0.5))
    dry_run_due = max(7, round(prep_window * 0.18))
    follow_up_day = duration_days + 7
    event_phase = "Event day" if duration_days == 1 else f"Program days 1-{duration_days}"
    event_relative = "0" if duration_days == 1 else f"0 to +{duration_days - 1}"
    budget_lines = [
        BudgetLineItem(category="Venue and streaming", amount=round(budget * 0.22, 2), assumption="Hybrid setup with recording support."),
        BudgetLineItem(category="Participant food and supplies", amount=round(budget * 0.24, 2), assumption=f"{duration_days}-day program with meals, maker supplies, and participant support."),
        BudgetLineItem(category="Prizes and grants", amount=round(budget * 0.25, 2), assumption="Meaningful awards plus pilot support for winners."),
        BudgetLineItem(category="Marketing and design", amount=round(budget * 0.12, 2), assumption="Launch creative, paid boosts, and collateral."),
        BudgetLineItem(category="Mentors and operations buffer", amount=round(budget * 0.17, 2), assumption="Honoraria, incidentals, and contingency."),
    ]
    total = round(sum(item.amount for item in budget_lines), 2)
    output = OperationsOutput(
        timeline=[
            TimelineItem(
                phase=f"T-minus {prep_window} days",
                relative_day=f"-{prep_window}",
                owner="Event lead",
                deliverable="Finalize theme, budget, sponsor list, and launch page.",
                exit_criteria="Public positioning and sponsor one-pager approved.",
            ),
            TimelineItem(
                phase=f"T-minus {sponsor_due} days",
                relative_day=f"-{sponsor_due}",
                owner="Partnerships",
                deliverable="Secure lead sponsors, mentors, and judge shortlist.",
                exit_criteria="At least three sponsor conversations in active follow-up.",
            ),
            TimelineItem(
                phase=f"T-minus {application_due} days",
                relative_day=f"-{application_due}",
                owner="Marketing",
                deliverable="Open applications and publish challenge tracks.",
                exit_criteria="Application funnel, FAQ, and social cadence live.",
            ),
            TimelineItem(
                phase=f"T-minus {dry_run_due} days",
                relative_day=f"-{dry_run_due}",
                owner="Operations",
                deliverable="Confirm venue, tooling, judging rubric, and run of show.",
                exit_criteria="Dry run completed with all critical owners.",
            ),
            TimelineItem(
                phase=event_phase,
                relative_day=event_relative,
                owner="Program manager",
                deliverable="Kickoff, mentor blocks, build sprint, checkpoints, demos, judging, awards.",
                exit_criteria="Winners selected and post-event follow-up scheduled.",
            ),
            TimelineItem(
                phase="Post-event",
                relative_day=f"+{follow_up_day}",
                owner="Community lead",
                deliverable="Publish recap, sponsor report, and incubation next steps.",
                exit_criteria="Sponsor report sent and project follow-ups booked.",
            ),
        ],
        tasks=[
            OperationsTask(description="Approve final event name and landing page copy.", owner="Event lead", due_window=f"T-minus {prep_window} days"),
            OperationsTask(description="Create sponsor target list and outreach tracker.", owner="Partnerships", due_window=f"T-minus {sponsor_due} days"),
            OperationsTask(description="Publish application form and participant FAQ.", owner="Marketing", due_window=f"T-minus {application_due} days"),
            OperationsTask(description="Recruit mentors and confirm office-hour schedule.", owner="Community", due_window=f"T-minus {max(14, dry_run_due * 2)} days"),
            OperationsTask(description="Prepare starter resources, sample datasets, and challenge prompt sheets.", owner="Program manager", due_window=f"T-minus {application_due} days"),
            OperationsTask(description="Confirm judging rubric, scoring tool, conflict-of-interest rules, and demo order.", owner="Judging lead", due_window=f"T-minus {max(7, dry_run_due)} days"),
            OperationsTask(description="Run technical dry run for demo submissions and streaming.", owner="Operations", due_window=f"T-minus {dry_run_due} days"),
            OperationsTask(description="Prepare demo-day judging packet and scoring form.", owner="Program manager", due_window="T-minus 3 days"),
            OperationsTask(description="Draft post-event recap, winner announcement, and sponsor report template.", owner="Marketing", due_window="T-plus 2 days"),
        ],
        staffing_plan=[
            "Event lead owns final decisions, sponsor commitments, and day-of escalation.",
            "Program manager owns run of show, judging flow, and participant communications.",
            "Marketing lead owns launch page, social cadence, email sends, and recap.",
            "Operations lead owns venue, tools, meals, streaming, and incident response.",
            "Partnerships lead owns sponsor pipeline, mentor commitments, and partner reporting.",
            "Judging lead owns rubric setup, judge briefing, scoring moderation, and winner validation.",
        ],
        budget_breakdown=budget_lines,
        budget_total=total,
        logistics=[
            f"Format: {brief.constraints.location} with clear remote participation expectations.",
            "Use one source of truth for schedule, mentor slots, submissions, and judging links.",
            "Create a 30-minute dry run for hosts, mentors, judges, and streaming support.",
            "Publish a participant command center with FAQ, schedule, contacts, resources, and submission requirements.",
            "Keep backup links for video, forms, chat, judging sheets, and sponsor handoff notes.",
        ],
        risks_and_mitigations=[
            {
                "risk": "Low application quality",
                "mitigation": "Publish concrete tracks and starter resources before the second launch week.",
            },
            {
                "risk": "Sponsor delay",
                "mitigation": "Offer tiered packages and lock non-cash support while budget approvals move.",
            },
            {
                "risk": "Day-of tooling failure",
                "mitigation": "Maintain backup submission forms, offline judging sheets, and a comms channel.",
            },
            {
                "risk": "Participant drop-off during a long program",
                "mitigation": "Add weekly checkpoints, public progress prompts, mentor nudges, and small milestone rewards.",
            },
            {
                "risk": "Judging inconsistency",
                "mitigation": "Brief judges together, calibrate with one sample project, and moderate score outliers before awards.",
            },
        ],
    )
    await remember(
        "event_templates",
        f"{branding.selected_name} operations plan total budget {total}",
        {
            "summary": f"Operations plan for {branding.selected_name} with budget {total}",
            "theme": brief.theme,
            "type": "operations_plan",
            "tags": _keyword_tokens(brief.theme),
        },
    )
    return output


async def run_critic_agent(
    research: ResearchOutput,
    branding: BrandingOutput,
    content: ContentOutput,
    social_media: SocialMediaOutput,
    operations: OperationsOutput,
) -> CriticReviewOutput:
    """Run the Critic agent."""

    prompt = _render_user_prompt(
        "critic",
        {
            "event_name": branding.selected_name,
            "rubric": "consistency, completeness, quality, actionability",
            "package_summary": (
                f"{len(content.outreach_emails)} emails, {len(social_media.posts)} posts, "
                f"{len(operations.tasks)} tasks, budget total {operations.budget_total:.0f}"
            ),
        },
    )
    generated = await maybe_generate_json_with_gemini(_spec("critic"), prompt, CriticReviewOutput)
    if generated is not None:
        return generated

    return score_package(research, branding, content, social_media, operations)


def _criterion(
    name: str,
    score: int,
    reason: str,
    evidence: list[str],
    targets: list[str] | None = None,
) -> CriterionScore:
    """Build one scored criterion with its rubric weight attached."""

    return CriterionScore(
        criterion=name,  # type: ignore[arg-type]
        score=max(1, min(10, score)),
        weight=CRITIC_RUBRIC[name],
        reason=reason,
        evidence=evidence,
        target_agents=[agent for agent in (targets or []) if agent != "none"],  # type: ignore[arg-type]
    )


def _score_consistency(
    branding: BrandingOutput,
    content: ContentOutput,
    social_media: SocialMediaOutput,
    operations: OperationsOutput,
) -> CriterionScore:
    """Do the agents' outputs agree with each other?"""

    name = branding.selected_name
    findings: list[str] = []
    targets: list[str] = []
    score = 10

    if name.lower() not in content.landing_page.hero_headline.lower():
        findings.append(
            f"Hero headline '{content.landing_page.hero_headline}' does not use the selected name '{name}'."
        )
        score -= 4
        targets.append("content")

    line_total = sum(item.amount for item in operations.budget_breakdown)
    if abs(line_total - operations.budget_total) > max(1.0, line_total * 0.01):
        findings.append(
            f"Budget total {operations.budget_total:,.0f} does not match the sum of its lines {line_total:,.0f}."
        )
        # An arithmetic contradiction is not a matter of degree. Penalise it
        # hard enough that it cannot sit at exactly the passing threshold.
        score -= 5
        targets.append("operations")

    off_brand_posts = [post for post in social_media.posts if name.lower() not in post.text.lower()]
    if len(off_brand_posts) == len(social_media.posts) and social_media.posts:
        findings.append("No social post mentions the event by name.")
        score -= 2
        targets.append("social_media")

    reason = (
        "Brand name, budget arithmetic and campaign references line up across agents."
        if not findings
        else "Cross-agent contradictions found: " + " ".join(findings)
    )
    return _criterion("consistency", score, reason, findings, targets)


def _score_completeness(
    research: ResearchOutput,
    content: ContentOutput,
    social_media: SocialMediaOutput,
    operations: OperationsOutput,
) -> CriterionScore:
    """Is every part of the package actually present, at usable depth?"""

    #: (label, actual, expected, agent to re-run if short)
    requirements = [
        ("outreach emails", len(content.outreach_emails), 4, "content"),
        ("sponsor pitch slides", len(content.sponsor_pitch_outline), 6, "content"),
        ("social posts", len(social_media.posts), 8, "social_media"),
        ("operations tasks", len(operations.tasks), 6, "operations"),
        ("timeline milestones", len(operations.timeline), 5, "operations"),
        ("sponsor targets", len(research.sponsor_targets), 3, "research"),
    ]
    short = [(label, actual, expected, agent) for label, actual, expected, agent in requirements if actual < expected]

    findings = [f"{label}: {actual} of {expected} expected." for label, actual, expected, _ in short]
    target = short[0][3] if short else "none"
    score = 10 - min(6, 2 * len(short))
    reason = (
        "Every section meets its expected depth."
        if not short
        else "Sections below the expected depth: " + " ".join(findings)
    )
    return _criterion("completeness", score, reason, findings, [target] if target != "none" else [])


def _score_quality(research: ResearchOutput, content: ContentOutput) -> CriterionScore:
    """Is the writing specific enough to be used as-is?"""

    findings: list[str] = []
    score = 9

    thin_emails = [email.audience for email in content.outreach_emails if len(email.body) < 120]
    if thin_emails:
        findings.append(f"Outreach bodies too short to send: {', '.join(thin_emails)}.")
        score -= 2

    if research.confidence < 0.5:
        findings.append(f"Research confidence is {research.confidence:.2f}; much of it is inferred.")
        score -= 1

    if len(content.risk_narrative) < 200:
        findings.append("Risk narrative is a summary rather than an analysis.")
        score -= 1

    reason = (
        "Copy is specific and long enough to use without a rewrite."
        if not findings
        else " ".join(findings)
    )
    return _criterion("quality", score, reason, findings, ["content"] if thin_emails else [])


def _score_actionability(operations: OperationsOutput) -> CriterionScore:
    """Could someone execute this plan without asking follow-up questions?"""

    findings: list[str] = []
    score = 10

    unowned = [task.description for task in operations.tasks if not task.owner.strip()]
    if unowned:
        findings.append(f"{len(unowned)} task(s) have no owner.")
        score -= 3

    undated = [task.description for task in operations.tasks if not task.due_window.strip()]
    if undated:
        findings.append(f"{len(undated)} task(s) have no due window.")
        score -= 2

    vague_exits = [item.phase for item in operations.timeline if len(item.exit_criteria) < 20]
    if vague_exits:
        findings.append(f"Milestones without a checkable exit criterion: {', '.join(vague_exits)}.")
        score -= 2

    if operations.budget_total <= 0:
        findings.append("Budget total is zero, so nothing can be committed against it.")
        score -= 4

    reason = (
        "Every task has an owner and a window, and every milestone a checkable exit criterion."
        if not findings
        else " ".join(findings)
    )
    return _criterion("actionability", score, reason, findings, ["operations"] if findings else [])


def _score_brand_alignment(branding: BrandingOutput, content: ContentOutput) -> CriterionScore:
    """Does the copy carry the brand the Branding agent chose?"""

    findings: list[str] = []
    score = 9
    haystack = " ".join(
        [content.landing_page.hero_headline, content.landing_page.subheadline]
        + [email.body for email in content.outreach_emails]
    ).lower()

    if branding.tagline.lower() not in haystack:
        findings.append("The tagline appears nowhere in the landing copy or outreach.")
        score -= 2

    missing_tone = [word for word in branding.tone if word.lower() not in haystack]
    if len(missing_tone) == len(branding.tone) and branding.tone:
        findings.append(f"None of the chosen tone words ({', '.join(branding.tone)}) surface in the copy.")
        score -= 2

    reason = (
        "Tagline and tone carry through the copy."
        if not findings
        else " ".join(findings)
    )
    return _criterion("brand_alignment", score, reason, findings, ["content"] if findings else [])


def score_package(
    research: ResearchOutput,
    branding: BrandingOutput,
    content: ContentOutput,
    social_media: SocialMediaOutput,
    operations: OperationsOutput,
) -> CriticReviewOutput:
    """Score a package against the rubric, one criterion at a time.

    Each check is a concrete assertion about the package, so the score carries
    a reason that can be shown to a user and a `target_agent` that tells the
    regeneration pass what to re-run. The previous implementation returned a
    flat map of numbers with a hardcoded 9-or-7.
    """

    criteria = [
        _score_consistency(branding, content, social_media, operations),
        _score_completeness(research, content, social_media, operations),
        _score_quality(research, content),
        _score_actionability(operations),
        _score_brand_alignment(branding, content),
    ]

    issues: list[str] = []
    for item in criteria:
        if not item.passed:
            issues.extend(item.evidence or [item.reason])

    suggestions = [
        f"Re-run the {', '.join(item.target_agents)} agent(s): {item.reason}"
        for item in criteria
        if not item.passed and item.target_agents
    ] or [
        "Before publication, verify sponsor names, dates, venue details, and any regional factual claims.",
        "Run one human editorial pass on outreach emails for brand voice and legal/compliance wording.",
    ]

    return CriticReviewOutput(criteria=criteria, issues=issues, suggestions=suggestions)


# ── deterministic repair ────────────────────────────────────────────────────
# Re-running a deterministic agent produces byte-identical output, so a
# regeneration pass would be theatre. These functions apply the specific,
# named repairs the deterministic Critic is capable of asking for. Anything the
# Critic cannot name concretely is left alone rather than "improved" blindly.


def repair_content(content: ContentOutput, branding: BrandingOutput) -> ContentOutput:
    """Fix the brand-carrying failures the Critic checks for."""

    patched = content.model_copy(deep=True)
    name = branding.selected_name

    if name.lower() not in patched.landing_page.hero_headline.lower():
        patched.landing_page.hero_headline = f"{name}: {patched.landing_page.hero_headline}".strip(": ")

    haystack = f"{patched.landing_page.hero_headline} {patched.landing_page.subheadline}".lower()
    if branding.tagline and branding.tagline.lower() not in haystack:
        patched.landing_page.subheadline = f"{branding.tagline} {patched.landing_page.subheadline}".strip()

    tone_words = [word for word in branding.tone if word.lower() not in haystack]
    if tone_words:
        descriptor = ", ".join(tone_words[:3])
        patched.landing_page.subheadline = (
            f"{patched.landing_page.subheadline} Built to be {descriptor}."
        )

    return patched


def repair_operations(operations: OperationsOutput) -> OperationsOutput:
    """Restore budget arithmetic and fill in unassigned execution details."""

    patched = operations.model_copy(deep=True)

    line_total = sum(item.amount for item in patched.budget_breakdown)
    if line_total > 0 and abs(line_total - patched.budget_total) > max(1.0, line_total * 0.01):
        patched.budget_total = round(line_total, 2)

    patched.tasks = [
        task.model_copy(
            update={
                "owner": task.owner.strip() or "Program manager",
                "due_window": task.due_window.strip() or "Before event day",
            }
        )
        for task in patched.tasks
    ]

    patched.timeline = [
        item.model_copy(
            update={
                "exit_criteria": (
                    item.exit_criteria
                    if len(item.exit_criteria) >= 20
                    else f"{item.deliverable} signed off by {item.owner}."
                )
            }
        )
        for item in patched.timeline
    ]

    return patched


def repair_social_media(social_media: SocialMediaOutput, branding: BrandingOutput) -> SocialMediaOutput:
    """Make sure the campaign names the event it is promoting."""

    patched = social_media.model_copy(deep=True)
    name = branding.selected_name
    if any(name.lower() in post.text.lower() for post in patched.posts):
        return patched
    patched.posts = [
        post.model_copy(update={"text": f"{name}: {post.text}"}) if index < 2 else post
        for index, post in enumerate(patched.posts)
    ]
    return patched


REPAIRS = {"content", "operations", "social_media"}


def compile_final_markdown(
    brief: EventLaunchRequest,
    research: ResearchOutput,
    branding: BrandingOutput,
    content: ContentOutput,
    social_media: SocialMediaOutput,
    operations: OperationsOutput,
    critique: CriticReviewOutput,
) -> str:
    """Compile a readable launch package artifact."""

    budget_lines = "\n".join(
        f"- {item.category}: {brief.constraints.currency} {item.amount:,.0f} ({item.assumption})"
        for item in operations.budget_breakdown
    )
    posts = "\n".join(
        f"- Week {post.week} {post.channel}: {post.text} {' '.join(post.hashtags)}"
        for post in social_media.posts[:6]
    )
    tasks = "\n".join(
        f"- {task.due_window}: {task.description} Owner: {task.owner}"
        for task in operations.tasks
    )
    emails = "\n".join(
        f"- {email.audience.title()}: {email.subject}"
        for email in content.outreach_emails
    )
    pitch = "\n".join(
        f"- {slide.slide_title}: {slide.objective}"
        for slide in content.sponsor_pitch_outline
    )
    research_risks = "\n".join(f"- {risk}" for risk in research.risks)
    operational_risks = "\n".join(
        f"- {item.get('risk', 'Risk')}: {item.get('mitigation', 'Mitigation pending')}"
        for item in operations.risks_and_mitigations
    )
    return (
        f"# {branding.selected_name}\n\n"
        f"{branding.tagline}\n\n"
        "## Positioning\n"
        f"{research.recommended_positioning}\n\n"
        "## Landing Page\n"
        f"Headline: {content.landing_page.hero_headline}\n\n"
        f"{content.landing_page.subheadline}\n\n"
        "## Outreach Emails\n"
        f"{emails}\n\n"
        "## Sponsor Pitch Outline\n"
        f"{pitch}\n\n"
        "## Social Campaign\n"
        f"{posts}\n\n"
        "## Operations Tasks\n"
        f"{tasks}\n\n"
        "## Budget\n"
        f"{budget_lines}\n\n"
        f"Total: {brief.constraints.currency} {operations.budget_total:,.0f}\n\n"
        "## Risk Analysis\n"
        f"{content.risk_narrative}\n\n"
        "Research risks:\n"
        f"{research_risks}\n\n"
        "Operational mitigations:\n"
        f"{operational_risks}\n\n"
        "## Critic Review\n"
        f"Approved: {critique.approved}. Weighted score: {critique.weighted_overall:.1f}/10.\n\n"
        f"{_critic_markdown(critique)}"
    )


def _critic_markdown(critique: CriticReviewOutput) -> str:
    """Render per-criterion scores and any regeneration pass into the artifact."""

    if not critique.criteria:
        return ""
    rows = "\n".join(
        f"- **{item.criterion.replace('_', ' ').title()}** {item.score}/10 "
        f"(weight {item.weight:.0%}): {item.reason}"
        for item in critique.criteria
    )
    regeneration = ""
    if critique.regeneration and critique.regeneration.attempted:
        record = critique.regeneration
        regeneration = (
            "\n\nRegeneration pass: re-ran "
            f"{', '.join(record.target_agents)} "
            f"({record.weighted_before:.1f} -> {record.weighted_after:.1f}). {record.note}"
        )
    return f"{rows}{regeneration}\n"


def runtime_note() -> str:
    """Return a user-facing runtime note for outputs and logs."""

    if settings.effective_agent_runtime == "gemini":
        return "Gemini runtime active; deterministic fallback is used only if Gemini validation fails."
    if settings.AGENT_RUNTIME == "auto":
        return "Auto runtime is using deterministic fallback because no Gemini-compatible key is configured."
    return "Deterministic runtime selected. Set AGENT_RUNTIME=auto with GEMINI_API_KEY or GOOGLE_API_KEY for model-backed agents."


def now_utc() -> datetime:
    """Return current UTC time."""

    return datetime.now(timezone.utc)
