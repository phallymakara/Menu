"""Real-time notification helper service.

Broadcasts system-wide catalog, table, and store configuration changes
across WebSocket rooms for staff (POS, KDS) and guest mobile devices.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ws_manager import ws_manager
from app.models.branch import Branch

logger = structlog.get_logger("app.services.realtime_notify_service")


async def broadcast_menu_update(
    session: AsyncSession,
    business_id: UUID,
    action: str,
    details: dict[str, Any] | None = None,
) -> None:
    """Broadcasts a menu catalog update event across all branches of a business."""
    try:
        branch_res = await session.execute(
            select(Branch.id).where(Branch.business_id == business_id)
        )
        branch_ids = branch_res.scalars().all()

        rooms: list[str] = []
        for b_id in branch_ids:
            rooms.extend([
                f"branch:{b_id}:pos",
                f"branch:{b_id}:expo",
                f"branch:{b_id}:guests",
            ])

        if not rooms:
            return

        payload_data = {
            "action": action,
            "business_id": str(business_id),
            **(details or {}),
        }

        await ws_manager.broadcast_to_rooms(
            rooms=rooms,
            event="menu.updated",
            data=payload_data,
            business_id=business_id,
        )
        logger.info(
            "Broadcasted menu catalog update",
            business_id=str(business_id),
            action=action,
            notified_rooms_count=len(rooms),
        )
    except Exception as exc:
        logger.warning(
            "Failed to broadcast menu update",
            error=str(exc),
            business_id=str(business_id),
        )


async def broadcast_store_update(
    session: AsyncSession,
    business_id: UUID,
    details: dict[str, Any] | None = None,
) -> None:
    """Broadcasts a business/store configuration update across all branch rooms."""
    try:
        branch_res = await session.execute(
            select(Branch.id).where(Branch.business_id == business_id)
        )
        branch_ids = branch_res.scalars().all()

        rooms: list[str] = []
        for b_id in branch_ids:
            rooms.extend([
                f"branch:{b_id}:pos",
                f"branch:{b_id}:expo",
                f"branch:{b_id}:guests",
            ])

        if not rooms:
            return

        payload_data = {
            "business_id": str(business_id),
            **(details or {}),
        }

        await ws_manager.broadcast_to_rooms(
            rooms=rooms,
            event="store.updated",
            data=payload_data,
            business_id=business_id,
        )
        logger.info(
            "Broadcasted store update",
            business_id=str(business_id),
            notified_rooms_count=len(rooms),
        )
    except Exception as exc:
        logger.warning(
            "Failed to broadcast store update",
            error=str(exc),
            business_id=str(business_id),
        )


async def broadcast_table_update(
    branch_id: UUID,
    business_id: UUID,
    table_id: UUID,
    action: str,
    table_status: str | None = None,
    table_number: str | None = None,
) -> None:
    """Broadcasts table status or layout changes to staff POS and KDS rooms."""
    try:
        rooms = [f"branch:{branch_id}:pos", f"branch:{branch_id}:expo"]
        payload_data = {
            "table_id": str(table_id),
            "branch_id": str(branch_id),
            "business_id": str(business_id),
            "action": action,
            "status": table_status,
            "table_number": table_number,
        }

        # Broadcast both dot-case and uppercase events for maximum compatibility
        await ws_manager.broadcast_to_rooms(
            rooms=rooms,
            event="table.status.changed",
            data=payload_data,
            business_id=business_id,
            branch_id=branch_id,
        )
        await ws_manager.broadcast_to_rooms(
            rooms=rooms,
            event="TABLE_STATUS_CHANGED",
            data=payload_data,
            business_id=business_id,
            branch_id=branch_id,
        )
        logger.info(
            "Broadcasted table status change",
            table_id=str(table_id),
            status=table_status,
            action=action,
        )
    except Exception as exc:
        logger.warning(
            "Failed to broadcast table update",
            error=str(exc),
            table_id=str(table_id),
        )
