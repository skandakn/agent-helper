"""FastAPI application entry point."""

from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import agents, analytics, auth, events, users
from app.core.config import settings
from app.db.session import init_db
from app.services.memory import init_collections
from app.ws import router as ws_router

logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.APP_NAME, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router)
app.include_router(agents.router)
app.include_router(analytics.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(ws_router)


@app.on_event("startup")
async def startup() -> None:
    """Initialize database and memory services with Docker-friendly retries."""

    last_exc: Exception | None = None
    for attempt in range(1, 16):
        try:
            await init_db()
            logger.info("Database initialized")
            break
        except Exception as exc:
            last_exc = exc
            logger.warning("Database not ready (attempt %s/15): %s", attempt, exc)
            await asyncio.sleep(2)
    else:
        raise RuntimeError(f"Database initialization failed: {last_exc}") from last_exc
    await init_collections()
