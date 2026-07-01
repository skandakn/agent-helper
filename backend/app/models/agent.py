"""Structured contracts for every agent in the workflow."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AgentContractModel(BaseModel):
    """Base model with strict assignment validation for agent payloads."""

    model_config = ConfigDict(validate_assignment=True, extra="forbid")


class MemoryReference(AgentContractModel):
    """A memory item that influenced an agent output."""

    collection: str
    memory_id: str
    score: float = Field(ge=0.0, le=1.0)
    summary: str


class SponsorTarget(AgentContractModel):
    """Potential sponsor with rationale."""

    name: str
    sector: str
    rationale: str
    pitch_angle: str


class CompetitorEvent(AgentContractModel):
    """Comparable hackathon or event pattern."""

    name: str
    lesson: str
    differentiation: str


class ResearchOutput(AgentContractModel):
    """Research agent output."""

    summary: str
    audience_insights: list[str] = Field(min_length=3)
    trends: list[str] = Field(min_length=3)
    competitors: list[CompetitorEvent] = Field(min_length=2)
    sponsor_targets: list[SponsorTarget] = Field(min_length=3)
    risks: list[str] = Field(min_length=3)
    recommended_positioning: str
    memory_used: list[MemoryReference] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class BrandNameOption(AgentContractModel):
    """Candidate event name."""

    name: str
    rationale: str
    score: int = Field(ge=1, le=10)


class PaletteColor(AgentContractModel):
    """Brand palette swatch."""

    name: str
    hex: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    usage: str


class BrandingOutput(AgentContractModel):
    """Branding agent output."""

    name_options: list[BrandNameOption] = Field(min_length=3)
    selected_name: str
    tagline: str
    tone: list[str] = Field(min_length=3)
    palette: list[PaletteColor] = Field(min_length=4)
    typography_direction: str
    logo_concepts: list[str] = Field(min_length=3)
    naming_guardrails: list[str] = Field(min_length=2)
    memory_checks: list[MemoryReference] = Field(default_factory=list)


class LandingPageCopy(AgentContractModel):
    """Landing page content structure."""

    hero_headline: str
    subheadline: str
    primary_cta: str
    secondary_cta: str
    sections: list[dict[str, str]] = Field(min_length=4)
    faq: list[dict[str, str]] = Field(min_length=4)


class EmailDraft(AgentContractModel):
    """Structured outreach email draft."""

    audience: Literal["participants", "sponsors", "judges", "partners"]
    subject: str
    preview_text: str
    body: str
    call_to_action: str


class SponsorPitchSection(AgentContractModel):
    """Pitch deck section outline."""

    slide_title: str
    objective: str
    talking_points: list[str] = Field(min_length=2)


class ContentOutput(AgentContractModel):
    """Content agent output."""

    landing_page: LandingPageCopy
    outreach_emails: list[EmailDraft] = Field(min_length=3)
    sponsor_pitch_outline: list[SponsorPitchSection] = Field(min_length=6)
    judging_rubric: list[dict[str, str]] = Field(min_length=4)
    risk_narrative: str
    reusable_assets: list[dict[str, str]] = Field(min_length=3)
    memory_used: list[MemoryReference] = Field(default_factory=list)


class SocialPost(AgentContractModel):
    """Single social post recommendation."""

    week: int = Field(ge=1)
    channel: Literal["LinkedIn", "X", "Instagram"]
    objective: str
    text: str
    hashtags: list[str] = Field(min_length=2)


class SocialMediaOutput(AgentContractModel):
    """Social media agent output."""

    campaign_name: str
    duration_weeks: int = Field(ge=1, le=104)
    cadence: str
    posts: list[SocialPost] = Field(min_length=6)
    creative_direction: list[str] = Field(min_length=3)
    memory_write_summary: str


class TimelineItem(AgentContractModel):
    """Milestone in the event operations timeline."""

    phase: str
    relative_day: str
    owner: str
    deliverable: str
    exit_criteria: str


class OperationsTask(AgentContractModel):
    """Actionable task with owner and due window."""

    description: str
    owner: str
    due_window: str
    status: Literal["todo", "in_progress", "done"] = "todo"


class BudgetLineItem(AgentContractModel):
    """Budget line item."""

    category: str
    amount: float = Field(ge=0)
    assumption: str


class OperationsOutput(AgentContractModel):
    """Operations agent output."""

    timeline: list[TimelineItem] = Field(min_length=5)
    tasks: list[OperationsTask] = Field(min_length=6)
    staffing_plan: list[str] = Field(min_length=3)
    budget_breakdown: list[BudgetLineItem] = Field(min_length=4)
    budget_total: float = Field(ge=0)
    logistics: list[str] = Field(min_length=3)
    risks_and_mitigations: list[dict[str, str]] = Field(min_length=3)

    @field_validator("budget_total")
    @classmethod
    def budget_total_is_positive(cls, value: float) -> float:
        """Ensure a usable positive budget is presented."""

        if value <= 0:
            raise ValueError("budget_total must be positive")
        return value


class CriticReviewOutput(AgentContractModel):
    """Critic/review agent output."""

    scores: dict[str, int]
    overall: int = Field(ge=1, le=10)
    issues: list[str]
    suggestions: list[str]
    approved: bool
    refinement_required: bool


class LaunchPackage(AgentContractModel):
    """Final compiled launch package."""

    event_id: int
    generated_at: datetime
    runtime: Literal["deterministic", "gemini"]
    runtime_note: str
    research: ResearchOutput
    branding: BrandingOutput
    content: ContentOutput
    social_media: SocialMediaOutput
    operations: OperationsOutput
    critique: CriticReviewOutput
    final_markdown: str


class AgentProgressEvent(BaseModel):
    """WebSocket progress payload."""

    event_id: int
    stage: str
    pct: int = Field(ge=0, le=100)
    status: Literal["queued", "running", "completed", "failed"]
    message: str
    data: dict = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentRunOutput(BaseModel):
    """API response for an agent run."""

    id: int
    agent_name: str
    event_id: int | None
    status: str
    runtime: str
    model_name: str | None
    input_data: dict
    output_data: dict
    error: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
