"""WebSocket connection manager for live workflow progress.

Progress events are also buffered per run so a client that drops mid-workflow
can ask for everything it missed instead of silently losing stages. Without
that, a reconnect during (say) the branding stage left the monitor showing
`content` at 0% forever, because the completion frame had already been sent to
a socket that no longer existed.

The buffer is in-process and bounded. With more than one API replica a client
can reconnect to an instance that never saw its run, so the handshake reports
whether the replay was complete and the client falls back to
`GET /events/{id}/progress` (and to status polling) when it was not.
"""

from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict, defaultdict, deque
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.models.agent import AgentProgressEvent

logger = logging.getLogger(__name__)
router = APIRouter()

#: Progress frames retained per run. A full workflow emits ~20.
MAX_EVENTS_PER_RUN = 400
#: Runs retained before the least recently used one is evicted.
MAX_RUNS = 200


class ProgressBuffer:
    """Bounded, per-run replay log of progress frames."""

    def __init__(self, max_events_per_run: int = MAX_EVENTS_PER_RUN, max_runs: int = MAX_RUNS) -> None:
        self._runs: OrderedDict[str, deque[tuple[int, dict]]] = OrderedDict()
        # Sequence counters outlive their frame buffers by an order of
        # magnitude. They are two integers each, and keeping them is what lets
        # `can_replay_from` tell "this run emitted frames we have since dropped"
        # apart from "we have never heard of this run" — the first is a gap the
        # client must reconcile over REST, the second is nothing to replay.
        self._next_seq: OrderedDict[str, int] = OrderedDict()
        self._max_events = max_events_per_run
        self._max_runs = max_runs

    def append(self, event_id: str, payload: dict) -> int:
        """Store a frame and return the sequence number assigned to it."""

        seq = self._next_seq.get(event_id, 0) + 1
        self._next_seq[event_id] = seq
        self._next_seq.move_to_end(event_id)

        buffer = self._runs.get(event_id)
        if buffer is None:
            buffer = deque(maxlen=self._max_events)
            self._runs[event_id] = buffer
        self._runs.move_to_end(event_id)
        buffer.append((seq, payload))
        self._evict()
        return seq

    def _evict(self) -> None:
        while len(self._runs) > self._max_runs:
            self._runs.popitem(last=False)
        while len(self._next_seq) > self._max_runs * 10:
            self._next_seq.popitem(last=False)

    def head(self, event_id: str) -> int:
        """Highest sequence number issued for a run (0 if none)."""

        return self._next_seq.get(event_id, 0)

    def oldest(self, event_id: str) -> int:
        """Lowest sequence number still buffered (0 if the run is unknown)."""

        buffer = self._runs.get(event_id)
        return buffer[0][0] if buffer else 0

    def since(self, event_id: str, seq: int) -> list[dict]:
        """Frames strictly after ``seq``, oldest first."""

        buffer = self._runs.get(event_id)
        if not buffer:
            return []
        return [payload for stored_seq, payload in buffer if stored_seq > seq]

    def can_replay_from(self, event_id: str, seq: int) -> bool:
        """Whether every frame after ``seq`` is still buffered."""

        head = self.head(event_id)
        if seq > head:
            # The client holds frames this instance never issued: either
            # another replica served the run, or we restarted.
            return False
        oldest = self.oldest(event_id)
        if oldest == 0:
            # No frames buffered. Complete only if none were ever emitted and
            # the client is not claiming to have seen any.
            return head == 0 and seq == 0
        return seq >= oldest - 1


progress_buffer = ProgressBuffer()


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
        """Buffer a frame, then fan it out without raising into the workflow."""

        payload = {**payload, "seq": progress_buffer.append(event_id, payload)}
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


def replay_since(event_id: str, seq: int) -> dict[str, Any]:
    """Return buffered frames after ``seq`` plus replay metadata."""

    return {
        "event_id": event_id,
        "since": seq,
        "head": progress_buffer.head(event_id),
        "complete": progress_buffer.can_replay_from(event_id, seq),
        "events": progress_buffer.since(event_id, seq),
    }


@router.websocket("/ws/{event_id}")
async def ws_endpoint(
    websocket: WebSocket,
    event_id: str,
    since: int = Query(
        default=0,
        ge=0,
        description="Highest progress seq the client already has. Frames after it are replayed on connect.",
    ),
) -> None:
    """Subscribe to live progress for a single event, replaying what was missed."""

    await manager.connect(event_id, websocket)
    try:
        replay = replay_since(event_id, since)
        await websocket.send_json(
            {
                "event_id": event_id,
                "stage": "connected",
                "pct": 0,
                "status": "running",
                "message": "Connected to live agent progress.",
                "data": {},
                "seq": since,
                "replay": {
                    "requested_since": since,
                    "head": replay["head"],
                    "count": len(replay["events"]),
                    # False means this instance cannot prove the client saw
                    # every frame; the client should reconcile over REST.
                    "complete": replay["complete"],
                },
            }
        )
        for payload in replay["events"]:
            await websocket.send_json(payload)

        while True:
            message = await websocket.receive_text()
            # Application-level heartbeat: the client cannot otherwise tell a
            # half-open socket (proxy idle timeout, laptop sleep) from a quiet
            # workflow, and would sit on a dead link showing "LIVE".
            if message == "ping":
                await websocket.send_json({"stage": "pong", "seq": progress_buffer.head(event_id)})
    except WebSocketDisconnect:
        manager.disconnect(event_id, websocket)
    except asyncio.CancelledError:  # pragma: no cover - shutdown path
        manager.disconnect(event_id, websocket)
        raise
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug("WebSocket for event %s ended: %s", event_id, exc)
        manager.disconnect(event_id, websocket)
