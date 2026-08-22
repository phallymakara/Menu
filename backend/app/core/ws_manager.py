from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import structlog
from fastapi import WebSocket

logger = structlog.get_logger("app.core.ws_manager")


class _CustomJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder handling UUIDs, Decimals, datetimes, and Pydantic models."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, Decimal):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        if hasattr(obj, "model_dump"):
            return obj.model_dump(mode="json")
        return super().default(obj)


def json_dumps(data: Any) -> str:
    """Serializes arbitrary python data to JSON string."""
    return json.dumps(data, cls=_CustomJSONEncoder)


class WebSocketConnectionManager:
    """
    In-memory multi-tenant WebSocket connection and room manager.
    Tracks active client connections grouped by room.
    """

    def __init__(self) -> None:
        # room_name -> set of active WebSockets
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)

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
        if room not in self._rooms or not self._rooms[room]:
            return

        payload = {
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "business_id": str(business_id) if business_id else None,
            "branch_id": str(branch_id) if branch_id else None,
            "data": data,
        }
        message_str = json_dumps(payload)

        stale_sockets: list[WebSocket] = []
        for ws in list(self._rooms[room]):
            try:
                await ws.send_text(message_str)
            except Exception as exc:
                logger.warning("Failed to send WS message, marking stale", error=str(exc))
                stale_sockets.append(ws)

        for ws in stale_sockets:
            self.disconnect(ws, room)

    async def broadcast_to_rooms(
        self,
        rooms: list[str],
        event: str,
        data: dict[str, Any],
        business_id: UUID | None = None,
        branch_id: UUID | None = None,
    ) -> None:
        """Broadcasts an event message across multiple rooms simultaneously."""
        for room in set(rooms):
            await self.broadcast_to_room(
                room=room,
                event=event,
                data=data,
                business_id=business_id,
                branch_id=branch_id,
            )


# Global singleton manager instance
ws_manager = WebSocketConnectionManager()
