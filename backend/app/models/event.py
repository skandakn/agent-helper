"""Pydantic models for event and project APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from app.models.agent import LaunchPackage


class EventConstraints(BaseModel):
    """User-provided planning constraints."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    budget: float = Field(
        default=500000,
        ge=0,
        validation_alias=AliasChoices("budget", "budget_inr"),
    )
    currency: str = "INR"
    duration_days: int = Field(default=60, ge=1, le=730)
    team_size: int = Field(default=5, ge=1, le=50)
    location: str = "Hybrid"
    application_deadline: str | None = None


class EventLaunchRequest(BaseModel):
    """Request to start a new launch package workflow."""

    model_config = ConfigDict(extra="ignore", validate_default=True)

    project_id: int | None = None
    theme: str = Field(min_length=3, max_length=300)
    goals: str = Field(default="", max_length=2000)
    audience: str = Field(default="", max_length=1000)
    venue: str | None = Field(default=None, max_length=500)
    date: datetime | None = None
    constraints: EventConstraints = Field(default_factory=EventConstraints)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("theme", "goals", "audience", mode="before")
    @classmethod
    def strip_text_fields(cls, value: str | None) -> str:
        """Normalize browser form strings before validation."""

        return value.strip() if isinstance(value, str) else value or ""

    @field_validator("goals")
    @classmethod
    def default_goals(cls, value: str) -> str:
        """Allow a topic-only launch by inferring a practical goal."""

        return value or "Generate a complete launch-ready hackathon campaign package."

    @field_validator("audience")
    @classmethod
    def default_audience(cls, value: str) -> str:
        """Allow the agent to proceed when the organizer only provides a topic."""

        return value or "builders, students, sponsors, mentors, judges, and community partners"


class EventLaunchResponse(BaseModel):
    """Response returned immediately after workflow creation."""

    event_id: int
    run_id: int
    status: str
    websocket_url: str


class EventStatusResponse(BaseModel):
    """Current event workflow status."""

    event_id: int
    status: str
    updated_at: datetime
    last_error: str | None = None
    progress: dict[str, Any] = Field(default_factory=dict)


class EventOutputResponse(BaseModel):
    """Final output for an event."""

    event_id: int
    status: str
    output: LaunchPackage | dict


class EventOutputUpdate(BaseModel):
    """Patch request for editable generated package fields."""

    final_markdown: str | None = Field(default=None, max_length=200000)
    output: dict[str, Any] | None = None


class EventRead(BaseModel):
    """Readable event record."""

    id: int
    project_id: int
    status: str
    brief: dict
    final_package: dict
    date: datetime | None
    venue: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectRead(BaseModel):
    """Readable project record."""

    id: int
    user_id: int
    title: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    events: list[EventRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
