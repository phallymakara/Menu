from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import OrderItemStatus, OrderStatus
from app.models.kitchen_station import KitchenStation
from app.models.order import Order, OrderItem
from app.schemas.kds import (
    CourseFireRequest,
    ItemRerouteRequest,
    ItemStatusBumpRequest,
    KDSTicketItemResponse,
    KDSTicketResponse,
)
from app.schemas.order import OrderItemModifierResponse

logger = structlog.get_logger("app.services.kds_service")


def _calculate_elapsed_minutes(created_at: datetime) -> int:
    """Calculates elapsed minutes since item/order creation."""
    now_utc = datetime.now(timezone.utc)
    target = (
        created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    )
    return max(0, int((now_utc - target).total_seconds() // 60))


def _map_order_item_to_kds_item(item: OrderItem) -> KDSTicketItemResponse:
    """Maps OrderItem ORM entity to KDSTicketItemResponse schema."""
    station = item.station
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
        elapsed_minutes=_calculate_elapsed_minutes(item.created_at),
    )


async def get_station_tickets(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
) -> list[KDSTicketResponse]:
    """
    Retrieves live order tickets relevant to a specific kitchen preparation station.
    Hides already-served items and orders.
    """
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

    # Active states on line cook screens
    active_item_statuses = [
        OrderItemStatus.HELD,
        OrderItemStatus.PENDING,
        OrderItemStatus.CONFIRMED,
        OrderItemStatus.PREPARING,
        OrderItemStatus.COOKING,
        OrderItemStatus.READY_TO_SERVE,
    ]

    # Query items routed to this station
    items_stmt = (
        select(OrderItem)
        .options(
            selectinload(OrderItem.modifiers),
            selectinload(OrderItem.station),
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

    # Group by order
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
        items_for_order = grouped_items[order_id]
        has_held = any(i.status == OrderItemStatus.HELD for i in items_for_order)
        tickets.append(
            KDSTicketResponse(
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
                elapsed_minutes=_calculate_elapsed_minutes(order.created_at),
                has_held_items=has_held,
                items=[_map_order_item_to_kds_item(i) for i in items_for_order],
            )
        )

    return tickets


async def get_expediter_tickets(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
) -> list[KDSTicketResponse]:
    """
    Expediter / Master Pass view: Shows items across all stations.
    """
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
        # Exclude voided items from active overview
        visible_items = [
            item for item in order.items if item.status != OrderItemStatus.VOIDED
        ]
        if not visible_items:
            continue

        has_held = any(i.status == OrderItemStatus.HELD for i in visible_items)
        tickets.append(
            KDSTicketResponse(
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
                elapsed_minutes=_calculate_elapsed_minutes(order.created_at),
                has_held_items=has_held,
                items=[_map_order_item_to_kds_item(i) for i in visible_items],
            )
        )

    return tickets


async def bump_item_status(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_item_id: UUID,
    payload: ItemStatusBumpRequest,
) -> KDSTicketItemResponse:
    """
    Bumps the status of a single dish (e.g. COOKING, READY, SERVED).
    Automatically updates timestamps and syncs parent Order status.
    """
    item_res = await session.execute(
        select(OrderItem)
        .options(
            selectinload(OrderItem.modifiers),
            selectinload(OrderItem.station),
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

    await session.commit()
    await session.refresh(item)

    logger.info(
        "Order item status bumped",
        item_id=str(item.id),
        new_status=item.status.value,
        order_number=parent_order.order_number,
    )
    return _map_order_item_to_kds_item(item)


async def fire_course(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: CourseFireRequest,
) -> list[KDSTicketItemResponse]:
    """
    Fires held items for an order ticket (e.g. Fire Mains or Fire Desserts).
    Changes status from HELD -> PENDING with fired_at timestamp.
    """
    order_res = await session.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
            selectinload(Order.items).selectinload(OrderItem.station),
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

    await session.commit()

    logger.info(
        "Course fired for order",
        order_number=order.order_number,
        fired_count=len(fired_items),
        course_stage=str(payload.course_stage) if payload.course_stage else "all",
    )
    return [_map_order_item_to_kds_item(i) for i in fired_items]


async def reroute_item_station(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_item_id: UUID,
    payload: ItemRerouteRequest,
) -> KDSTicketItemResponse:
    """
    Re-routes an active dish ticket from one station to another on the fly.
    """
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
    await session.commit()
    await session.refresh(item)

    logger.info(
        "Item rerouted to new station",
        item_id=str(item.id),
        new_station_code=station.code,
    )
    return _map_order_item_to_kds_item(item)
