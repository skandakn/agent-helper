"""FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import agents, analytics, auth, events, health, prompts, users
from app.api.health import mark_ready
from app.core.config import settings
from app.db.session import init_db
from app.services.memory import init_collections
from app.ws import router as ws_router

logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.APP_NAME, version="1.0.0")

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
request_logger = logging.getLogger("app.request")


async def request_id_middleware(request: Request, call_next):
    """Give every request a correlation ID and log it with the outcome.

    The browser sends X-Request-ID (one per logical request, reused across
    retries); anything else gets a fresh one. It is echoed on the response and
    written into this log line, so the "Ref" on an error notification finds
    the exact request in the server logs.

    Registered before CORSMiddleware, so it runs inside it: an unexpected
    exception becomes a 500 here that still gets CORS headers, instead of
    Starlette's outer 500 that the browser reports as "can't reach backend".
    """

    supplied = request.headers.get(REQUEST_ID_HEADER, "")
    request_id = supplied if _REQUEST_ID_RE.match(supplied) else uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        request_logger.exception(
            "request_id=%s %s %s -> 500 unhandled", request_id, request.method, request.url.path
        )
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal server error.", "request_id": request_id},
        )
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers[REQUEST_ID_HEADER] = request_id
    level = logging.WARNING if response.status_code >= 500 else logging.INFO
    if request.url.path != "/health" or response.status_code >= 500:
        request_logger.log(
            level,
            "request_id=%s %s %s -> %s (%.0f ms)",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
    return response


# Order matters: middleware added later wraps earlier ones, so CORS is outside
# the request-ID layer and decorates every response it produces.
app.add_middleware(BaseHTTPMiddleware, dispatch=request_id_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[REQUEST_ID_HEADER],
)

async def _database_unavailable(request: Request, exc: Exception) -> JSONResponse:
    """Answer a database outage with a 503 the browser can actually read.

    Unhandled exceptions are turned into a 500 by Starlette's outermost
    ServerErrorMiddleware, which sits outside CORSMiddleware, so that 500
    carries no Access-Control-Allow-Origin header. The browser then blocks it
    and the console reports "Couldn't reach the backend" when the backend is
    up and only its database is missing. Handlers registered here run inside
    CORSMiddleware, so this response keeps its CORS headers.
    """

    request_id = getattr(request.state, "request_id", None)
    logger.warning(
        "request_id=%s database unavailable for %s %s: %s", request_id, request.method, request.url.path, exc
    )
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The API is running but cannot reach its database. "
            "Check POSTGRES_URL on the backend; /health?deep=true has the details.",
            "request_id": request_id,
        },
    )


# asyncpg surfaces DNS / refused-connection failures as raw OSError
# (socket.gaierror, ConnectionRefusedError) rather than a SQLAlchemy error.
app.add_exception_handler(DBAPIError, _database_unavailable)
app.add_exception_handler(OSError, _database_unavailable)

app.include_router(health.router)
app.include_router(events.router)
app.include_router(agents.router)
app.include_router(analytics.router)
app.include_router(prompts.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(ws_router)


_init_task: asyncio.Task | None = None


async def _initialize_dependencies() -> None:
    """Bring up the database and memory services, retrying until they answer.

    This runs in the background rather than inside the startup hook. uvicorn
    only binds its port after every startup hook returns, so the old blocking
    loop (15 retries, then raise) meant a slow or misconfigured database kept
    the port closed for ~30s and then killed the process. On Render that
    surfaces as "no open ports detected" and a restart loop, and the frontend
    sits on its "waking the backend up" banner indefinitely. Now the port is
    open immediately, liveness answers 200, and ``/health?deep=true`` reports
    the actual database error until it is fixed.
    """

    attempt = 0
    while True:
        attempt += 1
        try:
            await init_db()
            logger.info("Database initialized")
            break
        except Exception as exc:
            delay = min(2 * attempt, 30)
            mark_ready(f"Database initialization failed (attempt {attempt}): {exc}")
            logger.warning(
                "Database not ready (attempt %s), retrying in %ss: %s", attempt, delay, exc
            )
            await asyncio.sleep(delay)

    try:
        await init_collections()
    except Exception as exc:  # memory has an in-process fallback; never fatal
        logger.warning("Memory bootstrap failed, using fallback: %s", exc)
    mark_ready()


@app.on_event("startup")
async def startup() -> None:
    """Start dependency initialization without blocking the port bind."""

    global _init_task
    _init_task = asyncio.create_task(_initialize_dependencies())


@app.on_event("shutdown")
async def shutdown() -> None:
    """Stop a still-running initialization loop."""

    if _init_task is not None and not _init_task.done():
        _init_task.cancel()
