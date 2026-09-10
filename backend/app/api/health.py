"""Dependency-aware health endpoint.

Two shapes, one contract:

``GET /health``
    Liveness. Answers from process state only, never touches Postgres or
    Qdrant, and always returns 200 while the process is serving. This is what
    Render's ``healthCheckPath`` hits, so a degraded Qdrant can never cause a
    deploy to be marked unhealthy and restarted.

``GET /health?deep=true`` (alias ``GET /health/ready``)
    Readiness. Probes every dependency with a bounded timeout and reports each
    one separately, including which fallback is carrying the load. Returns 503
    only when a *required* dependency is down or startup has not finished, so
    "Qdrant is on the in-process fallback" reads as ``degraded`` rather than as
    an outage.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Response, status

from app.core.config import settings
from app.db.session import check_database
from app.models.health import DependencyHealth, HealthReport, fold_status
from app.services.memory import check_memory, memory_backend

router = APIRouter(tags=["health"])

SERVICE_VERSION = "1.1.0"

#: Monotonic clock reading taken at import, used for uptime.
_started_monotonic = time.monotonic()
_started_at = datetime.now(timezone.utc)

#: Flipped by the startup hook once init_db()/init_collections() have run.
_ready = False
_startup_error: str | None = None


def mark_ready(error: str | None = None) -> None:
    """Record the outcome of application startup."""

    global _ready, _startup_error
    _startup_error = error
    _ready = error is None


def uptime_seconds() -> float:
    """Seconds since the process started serving."""

    return round(time.monotonic() - _started_monotonic, 3)


def _runtime_dependency() -> DependencyHealth:
    """Describe which agent runtime will actually execute a workflow."""

    effective = settings.effective_agent_runtime
    if settings.AGENT_RUNTIME == "gemini" and effective == "deterministic":
        return DependencyHealth(
            name="agent_runtime",
            status="degraded",
            required=False,
            detail="AGENT_RUNTIME=gemini but no Gemini-compatible key is configured.",
            degraded_mode="deterministic",
        )
    return DependencyHealth(
        name="agent_runtime",
        status="ok",
        required=False,
        detail=f"{effective} runtime active.",
    )


async def _probe_dependencies() -> list[DependencyHealth]:
    """Probe every dependency concurrently so a deep check stays fast."""

    db_task = asyncio.create_task(check_database())
    memory_task = asyncio.create_task(check_memory())
    db_ok, db_latency, db_detail = await db_task
    memory_status, memory_latency, memory_detail = await memory_task

    return [
        DependencyHealth(
            name="database",
            status="ok" if db_ok else "down",
            required=True,
            latency_ms=round(db_latency, 2),
            detail=db_detail if db_ok else f"Unreachable: {db_detail}",
        ),
        DependencyHealth(
            name="memory",
            status=memory_status,
            required=False,
            latency_ms=round(memory_latency, 2) if memory_latency is not None else None,
            detail=memory_detail,
            degraded_mode=memory_backend() if memory_status in {"degraded", "down"} else None,
        ),
        _runtime_dependency(),
    ]


def _build_report(dependencies: list[DependencyHealth], deep: bool) -> HealthReport:
    """Assemble the report and fold dependency states into one status."""

    return HealthReport(
        status=fold_status(dependencies, _ready),
        service=settings.APP_NAME,
        version=SERVICE_VERSION,
        environment=settings.APP_ENV,
        ready=_ready,
        uptime_seconds=uptime_seconds(),
        started_at=_started_at,
        checked_at=datetime.now(timezone.utc),
        deep=deep,
        auth_mode=settings.BACKEND_AUTH_MODE,
        agent_runtime=settings.effective_agent_runtime,
        dependencies=dependencies,
    )


@router.get("/health", response_model=HealthReport)
async def health(
    response: Response,
    deep: bool = Query(
        default=False,
        description="Probe dependencies instead of answering from process state alone.",
    ),
) -> HealthReport:
    """Return liveness, or a full dependency report when ``deep=true``."""

    if not deep:
        report = _build_report([], deep=False)
        if _startup_error:
            report.status = "starting"
        # Liveness never fails the deploy health check.
        return report

    report = _build_report(await _probe_dependencies(), deep=True)
    if report.status in {"down", "starting"}:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return report


@router.get("/health/ready", response_model=HealthReport)
async def readiness(response: Response) -> HealthReport:
    """Alias for ``/health?deep=true``, for orchestrators that want a path."""

    return await health(response, deep=True)
