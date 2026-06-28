"""Pydantic models for event and project APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.agent import LaunchPackage


class EventConstraints(BaseModel):
    """User-provided planning constraints."""

    budget: float = Field(default=50000, ge=0)
    currency: str = "USD"
    duration_days: int = Field(default=2, ge=1, le=14)
    team_size: int = Field(default=5, ge=1, le=50)
    location: str = "Hybrid"
    application_deadline: str | None = None


class EventLaunchRequest(BaseModel):
    """Request to start a new launch package workflow."""

    project_id: int | None = None
    theme: str = Field(min_length=3, max_length=300)
    goals: str = Field(min_length=3, max_length=2000)
    audience: str = Field(min_length=3, max_length=1000)
    venue: str | None = Field(default=None, max_length=500)
    date: datetime | None = None
    constraints: EventConstraints = Field(default_factory=EventConstraints)
    notes: str | None = Field(default=None, max_length=2000)


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

    theme: str | None = None
    goals: str | None = None
    audience: str | None = None
    progress: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def populate_flat_fields(cls, data: Any) -> Any:
        if not data:
            return data

        is_dict = isinstance(data, dict)
        
        brief = data.get("brief") if is_dict else getattr(data, "brief", None)
        if not isinstance(brief, dict):
            brief = {}

        theme = brief.get("theme")
        goals = brief.get("goals")
        audience = brief.get("audience")

        status_obj = data.get("status") if is_dict else getattr(data, "status", None)
        status_str = status_obj.value if hasattr(status_obj, "value") else str(status_obj)

        agent_runs = None
        if is_dict:
            agent_runs = data.get("agent_runs")
        else:
            state = getattr(data, "_sa_instance_state", None)
            if state is not None and "agent_runs" in state.unloaded:
                agent_runs = None
            else:
                try:
                    agent_runs = getattr(data, "agent_runs", None)
                except Exception:
                    agent_runs = None

        progress = {}
        if agent_runs is not None:
            STAGE_PCTS = {
                "research": 20,
                "branding": 38,
                "content": 58,
                "social_media": 72,
                "operations": 88,
                "critic": 94,
                "orchestrator": 100,
            }
            for run in agent_runs:
                run_status = run.get("status") if isinstance(run, dict) else getattr(run, "status", None)
                run_agent_name = run.get("agent_name") if isinstance(run, dict) else getattr(run, "agent_name", None)
                
                status_val = run_status.value if hasattr(run_status, "value") else str(run_status)
                if status_val in ("completed", "failed") and run_agent_name:
                    progress[run_agent_name] = STAGE_PCTS.get(run_agent_name, 0)

            if status_str == "ready":
                progress["done"] = 100

        result = {
            "id": data.get("id") if is_dict else getattr(data, "id", None),
            "project_id": data.get("project_id") if is_dict else getattr(data, "project_id", None),
            "status": status_str,
            "brief": brief,
            "final_package": data.get("final_package") if is_dict else getattr(data, "final_package", None),
            "date": data.get("date") if is_dict else getattr(data, "date", None),
            "venue": data.get("venue") if is_dict else getattr(data, "venue", None),
            "created_at": data.get("created_at") if is_dict else getattr(data, "created_at", None),
            "updated_at": data.get("updated_at") if is_dict else getattr(data, "updated_at", None),
            "theme": theme,
            "goals": goals,
            "audience": audience,
            "progress": progress,
        }
        return result


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
