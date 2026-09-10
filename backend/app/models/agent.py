"""Structured contracts for every agent in the workflow."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


#: The criteria the Critic scores, with the weight each carries in the overall.
#: Kept here rather than in the agent so the contract, the prompt template and
#: the UI all read the same rubric.
CRITIC_RUBRIC: dict[str, float] = {
    "consistency": 0.25,
    "completeness": 0.20,
    "quality": 0.20,
    "actionability": 0.20,
    "brand_alignment": 0.15,
}

#: A criterion below this fails and is eligible for a regeneration pass.
CRITIC_PASS_THRESHOLD = 7

CriterionName = Literal[
    "consistency", "completeness", "quality", "actionability", "brand_alignment"
]
RegenerableAgent = Literal[
    "research", "branding", "content", "social_media", "operations", "none"
]


class CriterionScore(AgentContractModel):
    """One rubric criterion, scored with its reasoning attached.

    The Critic used to emit a bare `{"consistency": 7}` map. A 7 with no reason
    is unactionable — it cannot be shown to a user, cannot be argued with, and
    cannot tell a regeneration pass which agent to re-run.
    """

    criterion: CriterionName
    score: int = Field(ge=1, le=10)
    weight: float = Field(ge=0.0, le=1.0)
    reason: str = Field(min_length=10, description="Why this score, citing the package.")
    evidence: list[str] = Field(
        default_factory=list,
        description="Concrete observations behind the score, quotable in the UI.",
    )
    target_agents: list[RegenerableAgent] = Field(
        default_factory=list,
        description=(
            "Every agent whose output must change to fix this criterion. One criterion can "
            "fail for reasons owned by different agents — a budget that does not add up and "
            "a headline that ignores the brand are both consistency failures."
        ),
    )
    target_agent: RegenerableAgent = Field(
        default="none",
        description="Primary target, derived from target_agents. Kept for readability and back-compat.",
    )

    @model_validator(mode="after")
    def reconcile_targets(self) -> "CriterionScore":
        """Keep `target_agent` and `target_agents` consistent whichever was set."""

        if self.target_agents:
            primary = self.target_agents[0]
            if self.target_agent != primary:
                object.__setattr__(self, "target_agent", primary)
        elif self.target_agent != "none":
            object.__setattr__(self, "target_agents", [self.target_agent])
        return self

    @property
    def passed(self) -> bool:
        """Whether this criterion meets the passing threshold."""

        return self.score >= CRITIC_PASS_THRESHOLD


class RegenerationRecord(AgentContractModel):
    """What the bounded regeneration pass did, and whether it helped."""

    attempted: bool = False
    passes_used: int = Field(default=0, ge=0)
    max_passes: int = Field(default=1, ge=0)
    target_agents: list[str] = Field(default_factory=list)
    triggered_by: list[str] = Field(
        default_factory=list, description="Criteria that scored below the threshold."
    )
    weighted_before: float = 0.0
    weighted_after: float = 0.0
    improved: bool = False
    note: str = ""


class CriticReviewOutput(AgentContractModel):
    """Critic/review agent output."""

    criteria: list[CriterionScore] = Field(
        default_factory=list, description="Per-criterion scores with reasons."
    )
    #: Flat name -> score map, derived from `criteria`. Retained because the
    #: package markdown and the existing UI read it.
    scores: dict[str, int] = Field(default_factory=dict)
    overall: int = Field(default=1, ge=1, le=10)
    weighted_overall: float = Field(default=0.0, ge=0.0, le=10.0)
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    approved: bool = False
    refinement_required: bool = False
    regeneration: RegenerationRecord | None = None

    @model_validator(mode="after")
    def derive_aggregates(self) -> "CriticReviewOutput":
        """Fill the aggregate fields from `criteria` when they were not supplied.

        A model returning only `criteria` (the shape the prompt asks for) still
        validates, and the derived numbers can never disagree with the
        per-criterion scores they summarise.
        """

        if not self.criteria:
            return self

        derived_scores = {item.criterion: item.score for item in self.criteria}
        total_weight = sum(item.weight for item in self.criteria) or 1.0
        weighted = sum(item.score * item.weight for item in self.criteria) / total_weight

        # Bypass validate_assignment: these are derived, not user input.
        object.__setattr__(self, "scores", derived_scores)
        object.__setattr__(self, "weighted_overall", round(weighted, 2))
        object.__setattr__(self, "overall", max(1, min(10, round(weighted))))

        failing = [item for item in self.criteria if not item.passed]
        object.__setattr__(self, "approved", not failing)
        object.__setattr__(self, "refinement_required", bool(failing))
        return self

    def failing_criteria(self) -> list[CriterionScore]:
        """Criteria below the passing threshold, worst first."""

        return sorted((item for item in self.criteria if not item.passed), key=lambda item: item.score)

    def regeneration_targets(self) -> list[str]:
        """Distinct agents named by failing criteria, worst-scoring first."""

        targets: list[str] = []
        for item in self.failing_criteria():
            for agent in item.target_agents or ([item.target_agent] if item.target_agent != "none" else []):
                if agent != "none" and agent not in targets:
                    targets.append(agent)
        return targets


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
    seq: int = Field(
        default=0,
        description=(
            "Monotonic per-run sequence number, assigned by the WebSocket layer on "
            "broadcast. Clients send the highest seq they hold as ?since= when "
            "reconnecting so missed frames are replayed."
        ),
    )


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
