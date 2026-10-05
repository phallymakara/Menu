"""Per-process WebSocket room registry and the broadcast entry point.

Services call ``ws_manager.broadcast_to_rooms(...)`` after they commit. The
manager serializes the event once and hands it to the active broadcaster
(see ``app.core.ws_broadcaster``), which makes sure every process passes it
to ``deliver_local`` for its own sockets in those rooms.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import structlog
from fastapi import WebSocket, status

from app.core.ws_broadcaster import Broadcaster, MemoryBroadcaster

logger = structlog.get_logger("app.core.ws_manager")

SEND_TIMEOUT_SECONDS = 2.0
"""How long one socket may take to accept a message before it is dropped."""


class _CustomJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder handling UUIDs, Decimals, datetimes, and Pydantic models."""

    def default(self, o: Any) -> Any:
        if isinstance(o, UUID):
            return str(o)
        if isinstance(o, Decimal):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        if hasattr(o, "model_dump"):
            return o.model_dump(mode="json")
        return super().default(o)


def json_dumps(data: Any) -> str:
    """Serializes arbitrary python data to JSON string."""
    return json.dumps(data, cls=_CustomJSONEncoder)


class WebSocketConnectionManager:
    """Tracks this process's WebSocket connections by room and fans out broadcasts.

    The room registry only holds sockets connected to this process. Reaching
    sockets on other workers or instances is the job of the broadcaster: the
    in-memory one by default, or Redis pub/sub once ``start`` is called with a
    ``RedisBroadcaster`` from the application lifespan.
    """

    def __init__(self, *, send_timeout: float = SEND_TIMEOUT_SECONDS) -> None:
        # room_name -> set of active WebSockets on this process
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._send_timeout = send_timeout
        self._broadcaster: Broadcaster = MemoryBroadcaster(self.deliver_local)
        self._close_tasks: set[asyncio.Task[None]] = set()

    @property
    def backend(self) -> str:
        """Name of the active broadcaster backend, "memory" or "redis"."""
        return self._broadcaster.backend

    async def start(self, broadcaster: Broadcaster) -> None:
        """Start ``broadcaster`` and route every broadcast through it."""
        previous = self._broadcaster
        await broadcaster.start(self.deliver_local)
        self._broadcaster = broadcaster
        await previous.stop()
        logger.info("Realtime broadcaster started", backend=broadcaster.backend)

    async def stop(self) -> None:
        """Stop the active broadcaster and fall back to in-process delivery."""
        broadcaster = self._broadcaster
        self._broadcaster = MemoryBroadcaster(self.deliver_local)
        await broadcaster.stop()
        logger.info("Realtime broadcaster stopped", backend=broadcaster.backend)

    async def connect(self, websocket: WebSocket, room: str) -> None:
        """Accepts and registers a new WebSocket connection into a room."""
        await websocket.accept()
        self._rooms[room].add(websocket)
        logger.info(
            "WebSocket connected to room",
            room=room,
            active_room_connections=len(self._rooms[room]),
        )

    def disconnect(self, websocket: WebSocket, room: str) -> None:
        """Removes a WebSocket connection from a room upon disconnect."""
        if room in self._rooms and websocket in self._rooms[room]:
            self._rooms[room].remove(websocket)
            if not self._rooms[room]:
                del self._rooms[room]
            logger.info(
                "WebSocket disconnected from room",
                room=room,
            )

    async def broadcast_to_room(
        self,
        room: str,
        event: str,
        data: dict[str, Any],
        business_id: UUID | None = None,
        branch_id: UUID | None = None,
    ) -> None:
        """Broadcasts a standardized event message to all clients in a room."""
        await self.broadcast_to_rooms(
            rooms=[room],
            event=event,
            data=data,
            business_id=business_id,
            branch_id=branch_id,
        )

    async def broadcast_to_rooms(
        self,
        rooms: list[str],
        event: str,
        data: dict[str, Any],
        business_id: UUID | None = None,
        branch_id: UUID | None = None,
    ) -> None:
        """Broadcasts one event to every client in ``rooms`` on every process.

        The event is serialized once and handed to the active broadcaster.
        Delivery problems are logged, never raised, so services can broadcast
        right after committing without putting the request at risk.
        """
        target_rooms = list(dict.fromkeys(rooms))
        if not target_rooms:
            return

        payload = {
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "business_id": str(business_id) if business_id else None,
            "branch_id": str(branch_id) if branch_id else None,
            "data": data,
        }
        await self._broadcaster.publish(target_rooms, json_dumps(payload))

    async def deliver_local(self, rooms: Iterable[str], message: str) -> int:
        """Send ``message`` to this process's sockets in ``rooms`` concurrently.

        Each socket gets at most ``send_timeout`` seconds. A socket that fails
        or times out is removed from its rooms and closed in the background,
        so one dead or slow client never holds up the others. Returns the
        number of sockets that received the message.
        """
        targets: dict[WebSocket, list[str]] = {}
        for room in dict.fromkeys(rooms):
            for websocket in self._rooms.get(room, ()):
                targets.setdefault(websocket, []).append(room)
        if not targets:
            return 0

        sockets = list(targets)
        failures = await asyncio.gather(*(self._send(ws, message) for ws in sockets))

        delivered = 0
        for websocket, failure in zip(sockets, failures, strict=True):
            if failure is None:
                delivered += 1
            else:
                self._evict(websocket, targets[websocket], failure)
        return delivered

    async def _send(self, websocket: WebSocket, message: str) -> str | None:
        """Send one message within the timeout; return a failure reason or None."""
        try:
            async with asyncio.timeout(self._send_timeout):
                await websocket.send_text(message)
        except TimeoutError:
            return "timeout"
        except Exception as exc:
            return type(exc).__name__
        return None

    def _evict(self, websocket: WebSocket, rooms: Sequence[str], reason: str) -> None:
        """Drop a dead or slow socket from ``rooms`` and close it in the background."""
        for room in rooms:
            self.disconnect(websocket, room)
        logger.warning(
            "Dropped unresponsive WebSocket client",
            rooms=list(rooms),
            reason=reason,
        )
        task = asyncio.create_task(self._close_quietly(websocket))
        self._close_tasks.add(task)
        task.add_done_callback(self._close_tasks.discard)

    async def _close_quietly(self, websocket: WebSocket) -> None:
        """Close a dropped socket so its client reconnects; ignore any failure."""
        with contextlib.suppress(Exception):
            async with asyncio.timeout(self._send_timeout):
                await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER)


# Global singleton manager instance
ws_manager = WebSocketConnectionManager()
