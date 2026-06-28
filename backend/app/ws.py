"""WebSocket connection manager for live workflow progress."""

from __future__ import annotations

import logging
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.agent import AgentProgressEvent

logger = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    """Track active WebSocket clients by event id."""

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, event_id: str, websocket: WebSocket) -> None:
        """Accept and register a WebSocket connection."""

        await websocket.accept()
        self._connections[event_id].append(websocket)

    def disconnect(self, event_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""

        if websocket in self._connections.get(event_id, []):
            self._connections[event_id].remove(websocket)
        if not self._connections.get(event_id):
            self._connections.pop(event_id, None)

    async def broadcast(self, event_id: str, payload: dict) -> None:
        """Broadcast JSON to every subscriber without raising into the workflow."""

        stale: list[WebSocket] = []
        for websocket in self._connections.get(event_id, []):
            try:
                await websocket.send_json(payload)
            except Exception as exc:
                logger.debug("Dropping stale websocket for event %s: %s", event_id, exc)
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(event_id, websocket)


manager = ConnectionManager()


async def broadcast_progress(event: AgentProgressEvent) -> None:
    """Broadcast a typed progress event to connected clients."""

    await manager.broadcast(str(event.event_id), event.model_dump(mode="json"))


@router.websocket("/ws/{event_id}")
async def ws_endpoint(websocket: WebSocket, event_id: str) -> None:
    """Subscribe to live progress for a single event."""

    await manager.connect(event_id, websocket)
    try:
        await websocket.send_json(
            {
                "event_id": event_id,
                "stage": "connected",
                "pct": 0,
                "status": "running",
                "message": "Connected to live agent progress.",
                "data": {},
            }
        )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(event_id, websocket)
