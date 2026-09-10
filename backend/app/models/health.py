"""Structured contracts for the health endpoint.

``GET /health`` used to return ``{"status": "ok", "timestamp": ...}``, which is
true whenever the process can serve a request and says nothing about whether
the workflow can actually run. A frontend reading it could only ever conclude
"something answered", which is how the console ended up displaying a resting
``UNKNOWN``. These contracts make the answer explicit and per-dependency.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DependencyStatus = Literal["ok", "degraded", "down", "skipped"]
ServiceStatus = Literal["ok", "degraded", "starting", "down"]

#: Worst-to-best ordering used when folding dependency states into one answer.
STATUS_SEVERITY: dict[str, int] = {"ok": 0, "skipped": 0, "degraded": 1, "down": 2}


class DependencyHealth(BaseModel):
    """Health of one thing the backend depends on."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="Stable identifier, e.g. 'database'.")
    status: DependencyStatus
    required: bool = Field(
        description="Whether the service can serve its core workflow without this dependency."
    )
    latency_ms: float | None = Field(
        default=None, description="Round-trip of the probe, when one was performed."
    )
    detail: str = Field(default="", description="Human-readable explanation, safe to display.")
    degraded_mode: str | None = Field(
        default=None,
        description="Name of the fallback in use when status is 'degraded', e.g. 'in_process_stub'.",
    )


class HealthReport(BaseModel):
    """Full dependency-aware health report."""

    model_config = ConfigDict(extra="forbid")

    status: ServiceStatus
    service: str
    version: str
    environment: str
    ready: bool = Field(description="Whether application startup finished successfully.")
    uptime_seconds: float
    cold_start: bool = Field(
        default=False,
        description=(
            "True while this process has been serving for less than COLD_START_WINDOW_SECONDS. "
            "Lets the console distinguish 'the instance just woke up' from 'it was always up'."
        ),
    )
    started_at: datetime
    checked_at: datetime
    deep: bool = Field(description="Whether dependencies were actually probed for this response.")
    auth_mode: str
    agent_runtime: str
    dependencies: list[DependencyHealth] = Field(default_factory=list)

    @property
    def failing(self) -> list[str]:
        """Names of dependencies that are not healthy."""

        return [dep.name for dep in self.dependencies if dep.status in {"degraded", "down"}]


def fold_status(dependencies: list[DependencyHealth], ready: bool) -> ServiceStatus:
    """Reduce dependency states into a single service status.

    A required dependency that is down makes the service ``down``; anything
    else unhealthy makes it ``degraded``. Startup that has not completed wins
    over everything, because nothing downstream is trustworthy yet.
    """

    if not ready:
        return "starting"
    worst: ServiceStatus = "ok"
    for dep in dependencies:
        severity = STATUS_SEVERITY.get(dep.status, 0)
        if severity == 0:
            continue
        if dep.required and dep.status == "down":
            return "down"
        worst = "degraded"
    return worst
