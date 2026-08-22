from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.tenant import TenantContext
from app.core.ws_manager import ws_manager
from app.models.enums import OrderItemStatus, OrderStatus
from app.models.kitchen_station import KitchenStation
from app.models.order import Order, OrderItem
from app.schemas.kds import (
    CourseFireRequest,
    ItemRerouteRequest,
    ItemStatusBumpRequest,
    KDSTicketItemResponse,
    KDSTicketResponse,
    StationMetricsResponse,
    StationTicketBumpRequest,
)
from app.schemas.order import OrderItemModifierResponse
from app.services.branch_roaming_service import can_user_roam_branches

logger = structlog.get_logger("app.services.kds_service")


def _enforce_kds_branch_access(tenant: TenantContext, branch_id: UUID) -> None:
    """
    Validates branch access permissions for KDS endpoints.
    Brand Owners and General Managers can access any branch.
    Local staff and branch managers are locked to their assigned branch.
    """
    if can_user_roam_branches(tenant.membership):
        return
    if tenant.membership.branch_id != branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have permission to view or manage KDS for this branch.",
        )


def _calculate_elapsed_minutes(created_at: datetime) -> int:
    """Calculates elapsed minutes since item/order creation."""
    now_utc = datetime.now(timezone.utc)
    target = (
        created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    )
    return max(0, int((now_utc - target).total_seconds() // 60))


def _map_order_item_to_kds_item(item: OrderItem) -> KDSTicketItemResponse:
    """Maps OrderItem ORM entity to KDSTicketItemResponse schema with SLA calculations."""
    station = item.station
    elapsed = _calculate_elapsed_minutes(item.created_at)
    target_prep = (
        item.menu_item.prep_time_minutes
        if (item.menu_item and item.menu_item.prep_time_minutes)
        else 15
    )
    is_overdue = elapsed > target_prep and item.status not in (
        OrderItemStatus.READY_TO_SERVE,
        OrderItemStatus.SERVED,
        OrderItemStatus.VOIDED,
    )
    if is_overdue:
        urgency = "critical"
    elif elapsed >= (target_prep * 0.5):
        urgency = "warning"
    else:
        urgency = "normal"

    return KDSTicketItemResponse(
        id=item.id,
        menu_item_id=item.menu_item_id,
        item_name_en=item.item_name_en,
        item_name_km=item.item_name_km,
        variant_name_en=item.variant_name_en,
        variant_name_km=item.variant_name_km,
        quantity=item.quantity,
        course_stage=item.course_stage,
        status=item.status,
        special_instructions=item.special_instructions,
        void_reason=item.void_reason,
        kitchen_station_id=item.kitchen_station_id,
        station_name=station.name_en if station else None,
        station_code=station.code if station else None,
        station_color_hex=station.color_hex if station else None,
        modifiers=[
            OrderItemModifierResponse.model_validate(mod) for mod in item.modifiers
        ],
        fired_at=item.fired_at,
        cooking_started_at=item.cooking_started_at,
        ready_at=item.ready_at,
        served_at=item.served_at,
        elapsed_minutes=elapsed,
        target_prep_time_minutes=target_prep,
        is_overdue=is_overdue,
        urgency_level=urgency,
    )


def _build_kds_ticket_response(
    order: Order, items: list[OrderItem]
) -> KDSTicketResponse:
    """Constructs KDSTicketResponse with aggregated SLA metrics across its items."""
    kds_items = [_map_order_item_to_kds_item(i) for i in items]
    elapsed = _calculate_elapsed_minutes(order.created_at)
    max_target_prep = max((i.target_prep_time_minutes for i in kds_items), default=15)
    is_ticket_overdue = any(i.is_overdue for i in kds_items)
    ticket_urgency = (
        "critical"
        if is_ticket_overdue
        else ("warning" if elapsed >= (max_target_prep * 0.5) else "normal")
    )
    has_held = any(i.status == OrderItemStatus.HELD for i in items)

    return KDSTicketResponse(
        order_id=order.id,
        order_number=order.order_number,
        order_type=order.order_type,
        round_number=order.round_number,
        table_id=order.table_id,
        table_number=order.table.table_number if order.table else None,
        table_session_id=order.table_session_id,
        session_code=(
            order.table_session.session_code if order.table_session else None
        ),
        guest_notes=order.guest_notes,
        created_at=order.created_at,
        elapsed_minutes=elapsed,
        max_target_prep_minutes=max_target_prep,
        is_ticket_overdue=is_ticket_overdue,
        ticket_urgency=ticket_urgency,
        has_held_items=has_held,
        items=kds_items,
    )


async def get_station_tickets(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
) -> list[KDSTicketResponse]:
    """
    Retrieves live order tickets relevant to a specific kitchen preparation station.
    Hides already-served items and orders.
    """
    _enforce_kds_branch_access(tenant, branch_id)

    # Verify Station
    station_res = await session.execute(
        select(KitchenStation).where(
            KitchenStation.id == station_id,
            KitchenStation.business_id == business_id,
            KitchenStation.branch_id == branch_id,
        )
    )
    station = station_res.scalar_one_or_none()
    if station is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kitchen station not found.",
        )

    active_item_statuses = [
        OrderItemStatus.HELD,
        OrderItemStatus.PENDING,
        OrderItemStatus.CONFIRMED,
        OrderItemStatus.PREPARING,
        OrderItemStatus.COOKING,
        OrderItemStatus.READY_TO_SERVE,
    ]

    items_stmt = (
        select(OrderItem)
        .options(
            selectinload(OrderItem.modifiers),
            selectinload(OrderItem.station),
            selectinload(OrderItem.menu_item),
            selectinload(OrderItem.order).selectinload(Order.table),
            selectinload(OrderItem.order).selectinload(Order.table_session),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.branch_id == branch_id,
            OrderItem.kitchen_station_id == station_id,
            OrderItem.status.in_(active_item_statuses),
        )
        .order_by(Order.created_at.asc(), OrderItem.created_at.asc())
    )
    items_res = await session.execute(items_stmt)
    station_items = list(items_res.scalars().all())

    orders_map: dict[UUID, Order] = {}
    grouped_items: dict[UUID, list[OrderItem]] = {}

    for item in station_items:
        order = item.order
        if order.id not in orders_map:
            orders_map[order.id] = order
            grouped_items[order.id] = []
        grouped_items[order.id].append(item)

    tickets: list[KDSTicketResponse] = []
    for order_id, order in orders_map.items():
        tickets.append(_build_kds_ticket_response(order, grouped_items[order_id]))

    return tickets


async def get_expediter_tickets(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
) -> list[KDSTicketResponse]:
    """
    Expediter / Master Pass view: Shows items across all stations.
    """
    _enforce_kds_branch_access(tenant, branch_id)

    active_order_statuses = [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_TO_SERVE,
    ]

    orders_stmt = (
        select(Order)
        .options(
            selectinload(Order.table),
            selectinload(Order.table_session),
            selectinload(Order.items).selectinload(OrderItem.modifiers),
            selectinload(Order.items).selectinload(OrderItem.station),
            selectinload(Order.items).selectinload(OrderItem.menu_item),
        )
        .where(
            Order.business_id == business_id,
            Order.branch_id == branch_id,
            Order.status.in_(active_order_statuses),
        )
        .order_by(Order.created_at.asc())
    )
    orders_res = await session.execute(orders_stmt)
    orders = list(orders_res.scalars().all())

    tickets: list[KDSTicketResponse] = []
    for order in orders:
        visible_items = [
            item for item in order.items if item.status != OrderItemStatus.VOIDED
        ]
        if not visible_items:
            continue
        tickets.append(_build_kds_ticket_response(order, visible_items))

    return tickets


async def bump_item_status(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    order_item_id: UUID,
    payload: ItemStatusBumpRequest,
) -> KDSTicketItemResponse:
    """
    Bumps the status of a single dish (e.g. COOKING, READY, SERVED).
    Automatically updates timestamps and syncs parent Order status.
    """
    _enforce_kds_branch_access(tenant, branch_id)

    item_res = await session.execute(
        select(OrderItem)
        .options(
            selectinload(OrderItem.modifiers),
            selectinload(OrderItem.station),
            selectinload(OrderItem.menu_item),
            selectinload(OrderItem.order).selectinload(Order.items),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            OrderItem.id == order_item_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
    )
    item = item_res.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order item not found.",
        )

    now_utc = datetime.now(timezone.utc)
    target = payload.target_status

    item.status = target

    if target in (OrderItemStatus.COOKING, OrderItemStatus.PREPARING):
        item.cooking_started_at = now_utc
    elif target == OrderItemStatus.READY_TO_SERVE:
        item.ready_at = now_utc
    elif target == OrderItemStatus.SERVED:
        item.served_at = now_utc
    elif target == OrderItemStatus.VOIDED:
        item.void_reason = payload.void_reason or "Voided on kitchen screen"

    # Sync Parent Order Status
    parent_order = item.order
    active_items = [
        i
        for i in parent_order.items
        if i.id != item.id and i.status != OrderItemStatus.VOIDED
    ]
    all_current_items = active_items + (
        [item] if target != OrderItemStatus.VOIDED else []
    )

    if all_current_items:
        if all(i.status == OrderItemStatus.SERVED for i in all_current_items):
            parent_order.status = OrderStatus.SERVED
        elif all(
            i.status in (OrderItemStatus.READY_TO_SERVE, OrderItemStatus.SERVED)
            for i in all_current_items
        ):
            parent_order.status = OrderStatus.READY_TO_SERVE
        elif any(
            i.status in (OrderItemStatus.COOKING, OrderItemStatus.PREPARING)
            for i in all_current_items
        ):
            parent_order.status = OrderStatus.PREPARING

    response = _map_order_item_to_kds_item(item)
    await session.commit()

    # Real-time WebSocket Broadcast
    notify_rooms = [f"branch:{branch_id}:pos", f"branch:{branch_id}:expo"]
    if item.kitchen_station_id:
        notify_rooms.append(f"branch:{branch_id}:station:{item.kitchen_station_id}")
    if parent_order.table_session_id:
        notify_rooms.append(f"session:{parent_order.table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="order.item_bumped",
        data={
            "order_id": str(parent_order.id),
            "order_item_id": str(item.id),
            "status": item.status.value,
            "order_status": parent_order.status.value,
            "item_name_en": item.item_name_en,
            "station_id": str(item.kitchen_station_id) if item.kitchen_station_id else None,
        },
        business_id=business_id,
        branch_id=branch_id,
    )

    logger.info(
        "Order item status bumped",
        item_id=str(item.id),
        new_status=item.status.value,
        order_number=parent_order.order_number,
    )
    return response


async def bump_station_ticket(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    station_id: UUID,
    payload: StationTicketBumpRequest,
) -> KDSTicketResponse:
    """
    Bumps all active items for a station on a single order ticket at once.
    """
    _enforce_kds_branch_access(tenant, branch_id)

    order_res = await session.execute(
        select(Order)
        .options(
            selectinload(Order.table),
            selectinload(Order.table_session),
            selectinload(Order.items).selectinload(OrderItem.modifiers),
            selectinload(Order.items).selectinload(OrderItem.station),
            selectinload(Order.items).selectinload(OrderItem.menu_item),
        )
        .where(
            Order.id == order_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
    )
    order = order_res.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )

    now_utc = datetime.now(timezone.utc)
    target = payload.target_status

    station_items: list[OrderItem] = []
    for item in order.items:
        if (
            item.kitchen_station_id == station_id
            and item.status != OrderItemStatus.VOIDED
        ):
            item.status = target
            if target in (OrderItemStatus.COOKING, OrderItemStatus.PREPARING):
                item.cooking_started_at = now_utc
            elif target == OrderItemStatus.READY_TO_SERVE:
                item.ready_at = now_utc
            elif target == OrderItemStatus.SERVED:
                item.served_at = now_utc
            station_items.append(item)

    # Sync Parent Order Status
    non_void_items = [i for i in order.items if i.status != OrderItemStatus.VOIDED]
    if non_void_items:
        if all(i.status == OrderItemStatus.SERVED for i in non_void_items):
            order.status = OrderStatus.SERVED
        elif all(
            i.status in (OrderItemStatus.READY_TO_SERVE, OrderItemStatus.SERVED)
            for i in non_void_items
        ):
            order.status = OrderStatus.READY_TO_SERVE
        elif any(
            i.status in (OrderItemStatus.COOKING, OrderItemStatus.PREPARING)
            for i in non_void_items
        ):
            order.status = OrderStatus.PREPARING

    response = _build_kds_ticket_response(order, station_items)
    await session.commit()

    # Real-time WebSocket Broadcast
    notify_rooms = [
        f"branch:{branch_id}:pos",
        f"branch:{branch_id}:expo",
        f"branch:{branch_id}:station:{station_id}",
    ]
    if order.table_session_id:
        notify_rooms.append(f"session:{order.table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="order.item_bumped",
        data={
            "order_id": str(order.id),
            "order_status": order.status.value,
            "station_id": str(station_id),
            "target_status": target.value,
            "bumped_count": len(station_items),
        },
        business_id=business_id,
        branch_id=branch_id,
    )

    logger.info(
        "Station ticket bumped",
        order_number=order.order_number,
        station_id=str(station_id),
        bumped_count=len(station_items),
        target_status=target.value,
    )
    return response


async def undo_item_status(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    order_item_id: UUID,
) -> KDSTicketItemResponse:
    """
    Reverts a bumped item back to PREPARING / COOKING.
    """
    _enforce_kds_branch_access(tenant, branch_id)

    item_res = await session.execute(
        select(OrderItem)
        .options(
            selectinload(OrderItem.modifiers),
            selectinload(OrderItem.station),
            selectinload(OrderItem.menu_item),
            selectinload(OrderItem.order).selectinload(Order.items),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            OrderItem.id == order_item_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
    )
    item = item_res.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order item not found.",
        )

    # Revert to PREPARING
    item.status = OrderItemStatus.PREPARING
    item.ready_at = None
    item.served_at = None

    parent_order = item.order
    parent_order.status = OrderStatus.PREPARING

    response = _map_order_item_to_kds_item(item)
    await session.commit()

    # Real-time WebSocket Broadcast
    notify_rooms = [f"branch:{branch_id}:pos", f"branch:{branch_id}:expo"]
    if item.kitchen_station_id:
        notify_rooms.append(f"branch:{branch_id}:station:{item.kitchen_station_id}")
    if parent_order.table_session_id:
        notify_rooms.append(f"session:{parent_order.table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="order.item_bumped",
        data={
            "order_id": str(parent_order.id),
            "order_item_id": str(item.id),
            "status": item.status.value,
            "order_status": parent_order.status.value,
            "item_name_en": item.item_name_en,
            "station_id": str(item.kitchen_station_id) if item.kitchen_station_id else None,
        },
        business_id=business_id,
        branch_id=branch_id,
    )

    logger.info(
        "Order item reverted",
        item_id=str(item.id),
        order_number=parent_order.order_number,
    )
    return response

    logger.info(
        "Order item reverted",
        item_id=str(item.id),
        order_number=parent_order.order_number,
    )
    return _map_order_item_to_kds_item(item)


async def recall_station_tickets(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    minutes_history: int = 15,
) -> list[KDSTicketResponse]:
    """
    Retrieves recently completed/served tickets for a station within the history window.
    """
    _enforce_kds_branch_access(tenant, branch_id)

    since_time = datetime.now(timezone.utc) - timedelta(minutes=minutes_history)

    items_stmt = (
        select(OrderItem)
        .options(
            selectinload(OrderItem.modifiers),
            selectinload(OrderItem.station),
            selectinload(OrderItem.menu_item),
            selectinload(OrderItem.order).selectinload(Order.table),
            selectinload(OrderItem.order).selectinload(Order.table_session),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.branch_id == branch_id,
            OrderItem.kitchen_station_id == station_id,
            OrderItem.status.in_([OrderItemStatus.READY_TO_SERVE, OrderItemStatus.SERVED]),
            OrderItem.updated_at >= since_time,
        )
        .order_by(OrderItem.updated_at.desc())
    )
    items_res = await session.execute(items_stmt)
    station_items = list(items_res.scalars().all())

    orders_map: dict[UUID, Order] = {}
    grouped_items: dict[UUID, list[OrderItem]] = {}

    for item in station_items:
        order = item.order
        if order.id not in orders_map:
            orders_map[order.id] = order
            grouped_items[order.id] = []
        grouped_items[order.id].append(item)

    tickets: list[KDSTicketResponse] = []
    for order_id, order in orders_map.items():
        tickets.append(_build_kds_ticket_response(order, grouped_items[order_id]))

    return tickets


async def get_station_metrics(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
) -> StationMetricsResponse:
    """
    Calculates live metrics for station header: active tickets, overdue tickets, avg prep time.
    """
    _enforce_kds_branch_access(tenant, branch_id)

    station_res = await session.execute(
        select(KitchenStation).where(
            KitchenStation.id == station_id,
            KitchenStation.business_id == business_id,
            KitchenStation.branch_id == branch_id,
        )
    )
    station = station_res.scalar_one_or_none()
    if station is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kitchen station not found.",
        )

    # Fetch active tickets for this station
    active_tickets = await get_station_tickets(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        station_id=station_id,
    )

    active_count = len(active_tickets)
    overdue_count = sum(1 for t in active_tickets if t.is_ticket_overdue)
    avg_prep = (
        sum(t.elapsed_minutes for t in active_tickets) / active_count
        if active_count > 0
        else 0.0
    )

    return StationMetricsResponse(
        station_id=station.id,
        station_name=station.name_en,
        station_code=station.code,
        branch_id=branch_id,
        active_tickets=active_count,
        overdue_tickets=overdue_count,
        avg_prep_time_minutes=round(avg_prep, 1),
    )


async def fire_course(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: CourseFireRequest,
) -> list[KDSTicketItemResponse]:
    """
    Fires held items for an order ticket (e.g. Fire Mains or Fire Desserts).
    Changes status from HELD -> PENDING with fired_at timestamp.
    """
    _enforce_kds_branch_access(tenant, branch_id)

    order_res = await session.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
            selectinload(Order.items).selectinload(OrderItem.station),
            selectinload(Order.items).selectinload(OrderItem.menu_item),
        )
        .where(
            Order.id == order_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
    )
    order = order_res.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )

    now_utc = datetime.now(timezone.utc)
    fired_items: list[OrderItem] = []

    for item in order.items:
        should_fire = False
        if payload.order_item_ids and item.id in payload.order_item_ids:
            should_fire = True
        elif payload.course_stage and item.course_stage == payload.course_stage:
            should_fire = True
        elif not payload.order_item_ids and not payload.course_stage:
            should_fire = True

        if should_fire and item.status == OrderItemStatus.HELD:
            item.status = OrderItemStatus.PENDING
            item.fired_at = now_utc
            fired_items.append(item)

    response_items = [_map_order_item_to_kds_item(i) for i in fired_items]
    await session.commit()

    # Real-time WebSocket Broadcast
    notify_rooms = [f"branch:{branch_id}:pos", f"branch:{branch_id}:expo"]
    for item in fired_items:
        if item.kitchen_station_id:
            notify_rooms.append(f"branch:{branch_id}:station:{item.kitchen_station_id}")
    if order.table_session_id:
        notify_rooms.append(f"session:{order.table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="order.course_fired",
        data={
            "order_id": str(order.id),
            "order_number": order.order_number,
            "fired_count": len(fired_items),
            "course_stage": str(payload.course_stage) if payload.course_stage else "all",
        },
        business_id=business_id,
        branch_id=branch_id,
    )

    logger.info(
        "Course fired for order",
        order_number=order.order_number,
        fired_count=len(fired_items),
        course_stage=str(payload.course_stage) if payload.course_stage else "all",
    )
    return response_items


async def reroute_item_station(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    order_item_id: UUID,
    payload: ItemRerouteRequest,
) -> KDSTicketItemResponse:
    """
    Re-routes an active dish ticket from one station to another on the fly.
    """
    _enforce_kds_branch_access(tenant, branch_id)

    # Verify Target Station
    station_res = await session.execute(
        select(KitchenStation).where(
            KitchenStation.id == payload.target_kitchen_station_id,
            KitchenStation.business_id == business_id,
            KitchenStation.branch_id == branch_id,
        )
    )
    station = station_res.scalar_one_or_none()
    if station is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target kitchen station not found.",
        )

    item_res = await session.execute(
        select(OrderItem)
        .options(
            selectinload(OrderItem.modifiers),
            selectinload(OrderItem.station),
            selectinload(OrderItem.menu_item),
            selectinload(OrderItem.order),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(
            OrderItem.id == order_item_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
    )
    item = item_res.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order item not found.",
        )

    item.kitchen_station_id = payload.target_kitchen_station_id
    item.station = station
    response = _map_order_item_to_kds_item(item)
    await session.commit()

    logger.info(
        "Item rerouted to new station",
        item_id=str(item.id),
        new_station_code=station.code,
    )
    return response
