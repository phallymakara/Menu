from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import decode_access_token
from app.core.ws_manager import ws_manager
from app.db.session import AsyncSessionFactory
from app.models.enums import (
    MembershipStatus,
    TableSessionStatus,
    UserStatus,
)
from app.models.organization_membership import OrganizationMembership
from app.models.table_session import TableSession
from app.models.user import User
from app.services.branch_roaming_service import can_user_roam_branches

logger = structlog.get_logger("app.api.v1.endpoints.websockets")

router = APIRouter(prefix="/ws", tags=["Real-Time WebSockets"])


@router.websocket("/branches/{branch_id}")
async def websocket_staff_endpoint(
    websocket: WebSocket,
    branch_id: UUID,
    token: Annotated[str, Query()],
    room_type: Annotated[str, Query()] = "pos",
    station_id: Annotated[UUID | None, Query()] = None,
) -> None:
    """
    Staff WebSocket connection for real-time POS, Expo, and KDS updates.
    Authenticated via JWT token in query parameter.
    """
    # 1. Verify JWT Token
    try:
        user_id = decode_access_token(token)
    except Exception:
        logger.warning("Staff WS connection rejected: Invalid JWT token")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return

    # 2. Check user membership & branch permissions
    async with AsyncSessionFactory() as session:
        user_stmt = select(User).where(User.id == user_id, User.status == UserStatus.ACTIVE)
        user_res = await session.execute(user_stmt)
        user = user_res.scalar_one_or_none()
        if not user:
            logger.warning("Staff WS connection rejected: Inactive/missing user")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User inactive")
            return

        mem_stmt = select(OrganizationMembership).where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.status.in_([MembershipStatus.ACTIVE, "active"]),
        )
        mem_res = await session.execute(mem_stmt)
        memberships = mem_res.scalars().all()

        has_access = False
        for mem in memberships:
            if can_user_roam_branches(mem) or mem.branch_id == branch_id:
                has_access = True
                break

        if not has_access:
            logger.warning(
                "Staff WS connection rejected: Branch access denied",
                user_id=str(user_id),
                branch_id=str(branch_id),
            )
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Branch access denied")
            return

    # 3. Determine Room
    if room_type == "expo":
        room = f"branch:{branch_id}:expo"
    elif room_type == "station" and station_id:
        room = f"branch:{branch_id}:station:{station_id}"
    else:
        room = f"branch:{branch_id}:pos"

    await ws_manager.connect(websocket, room)
    try:
        while True:
            # Keep connection open and handle optional client ping/pong messages
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, room)
    except Exception as exc:
        logger.warning("Staff WS connection error", error=str(exc), room=room)
        ws_manager.disconnect(websocket, room)


@router.websocket("/sessions/{table_session_id}")
async def websocket_guest_endpoint(
    websocket: WebSocket,
    table_session_id: UUID,
    session_token: Annotated[str, Query()],
) -> None:
    """
    Guest WebSocket connection for live order tracking & payment receipt notifications.
    Authenticated via table session token in query parameter.
    """
    # 1. Verify Table Session Token
    async with AsyncSessionFactory() as session:
        stmt = (
            select(TableSession)
            .options(selectinload(TableSession.table))
            .where(
                TableSession.id == table_session_id,
                TableSession.session_token == session_token,
                TableSession.status == TableSessionStatus.ACTIVE,
            )
        )
        res = await session.execute(stmt)
        table_session = res.scalar_one_or_none()
        if not table_session:
            logger.warning(
                "Guest WS connection rejected: Invalid or inactive session token",
                table_session_id=str(table_session_id),
            )
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid session")
            return

    room = f"session:{table_session_id}"
    await ws_manager.connect(websocket, room)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, room)
    except Exception as exc:
        logger.warning("Guest WS connection error", error=str(exc), room=room)
        ws_manager.disconnect(websocket, room)
