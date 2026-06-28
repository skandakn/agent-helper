"""SQLAlchemy ORM models for persisted application state."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict, MutableList
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp."""

    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    """Declarative model base."""


JsonType = JSON().with_variant(JSONB, "postgresql")


class TimestampMixin:
    """Created/updated timestamp columns."""

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )


class EventStatus(str, PyEnum):
    """Lifecycle state for an event workflow."""

    draft = "draft"
    planning = "planning"
    running = "running"
    reviewing = "reviewing"
    ready = "ready"
    launched = "launched"
    failed = "failed"


class TaskStatus(str, PyEnum):
    """Operational task status."""

    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class AgentRunStatus(str, PyEnum):
    """Agent run execution status."""

    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class User(Base, TimestampMixin):
    """Application user."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    preferences: Mapped[dict] = mapped_column(MutableDict.as_mutable(JsonType), default=dict)

    projects: Mapped[list[Project]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Project(Base, TimestampMixin):
    """A workspace that can contain one or more event launches."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner: Mapped[User] = relationship(back_populates="projects")
    events: Mapped[list[Event]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Event(Base, TimestampMixin):
    """A single hackathon launch workflow instance."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    venue: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        Enum(EventStatus, name="event_status"),
        default=EventStatus.draft,
        index=True,
    )
    brief: Mapped[dict] = mapped_column(MutableDict.as_mutable(JsonType), default=dict)
    final_package: Mapped[dict] = mapped_column(MutableDict.as_mutable(JsonType), default=dict)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped[Project] = relationship(back_populates="events")
    campaigns: Mapped[list[Campaign]] = relationship(back_populates="event", cascade="all, delete-orphan")
    tasks: Mapped[list[Task]] = relationship(back_populates="event", cascade="all, delete-orphan")
    agent_runs: Mapped[list[AgentRun]] = relationship(back_populates="event", cascade="all, delete-orphan")


class Campaign(Base, TimestampMixin):
    """A campaign generated for an event."""

    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(
        "metadata",
        MutableDict.as_mutable(JsonType),
        default=dict,
    )

    event: Mapped[Event] = relationship(back_populates="campaigns")
    assets: Mapped[list[Asset]] = relationship(back_populates="campaign", cascade="all, delete-orphan")


class Asset(Base, TimestampMixin):
    """A generated marketing, operations, or sponsor asset."""

    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(
        "metadata",
        MutableDict.as_mutable(JsonType),
        default=dict,
    )

    campaign: Mapped[Campaign] = relationship(back_populates="assets")


class Task(Base, TimestampMixin):
    """Operational task created by the Operations agent."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status"),
        default=TaskStatus.todo,
        index=True,
    )
    metadata_json: Mapped[dict] = mapped_column(
        "metadata",
        MutableDict.as_mutable(JsonType),
        default=dict,
    )

    event: Mapped[Event] = relationship(back_populates="tasks")


class AgentRun(Base, TimestampMixin):
    """A persisted agent invocation with structured inputs and outputs."""

    __tablename__ = "agent_runs"
    __table_args__ = (
        Index("ix_agent_runs_event_agent", "event_id", "agent_name"),
        Index("ix_agent_runs_event_status", "event_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_name: Mapped[str] = mapped_column(String(100), nullable=False)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=True)
    input_data: Mapped[dict] = mapped_column(MutableDict.as_mutable(JsonType), default=dict)
    output_data: Mapped[dict] = mapped_column(MutableDict.as_mutable(JsonType), default=dict)
    status: Mapped[AgentRunStatus] = mapped_column(
        Enum(AgentRunStatus, name="agent_run_status"),
        default=AgentRunStatus.pending,
        index=True,
    )
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    runtime: Mapped[str] = mapped_column(String(50), default="deterministic")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    event: Mapped[Event | None] = relationship(back_populates="agent_runs")
    logs: Mapped[list[AuditLog]] = relationship(back_populates="run", cascade="all, delete-orphan")


class AuditLog(Base):
    """Append-only audit log for agent and API actions."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"),
        nullable=True,
    )
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(String(20), default="INFO")
    payload: Mapped[dict] = mapped_column(MutableDict.as_mutable(JsonType), default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    run: Mapped[AgentRun | None] = relationship(back_populates="logs")


class MemoryRecord(Base, TimestampMixin):
    """Database index of useful long-term memories written to Qdrant or fallback memory."""

    __tablename__ = "memory_records"
    __table_args__ = (
        UniqueConstraint("collection", "memory_id", name="uq_memory_collection_memory_id"),
        Index("ix_memory_records_collection", "collection"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    collection: Mapped[str] = mapped_column(String(100), nullable=False)
    memory_id: Mapped[str] = mapped_column(String(128), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(MutableDict.as_mutable(JsonType), default=dict)
    tags: Mapped[list] = mapped_column(MutableList.as_mutable(JsonType), default=list)
