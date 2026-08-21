from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.category import Category
from app.models.kitchen_station import KitchenStation
from app.models.menu_item import MenuItem
from app.schemas.kitchen_station import (
    KitchenStationCreate,
    KitchenStationUpdate,
    StationItemAssignRequest,
)

logger = structlog.get_logger("app.services.kitchen_station_service")


async def create_kitchen_station(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    payload: KitchenStationCreate,
) -> KitchenStation:
    """Creates a new custom kitchen station for a branch."""
    branch_res = await session.execute(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.business_id == business_id,
        )
    )
    branch = branch_res.scalar_one_or_none()
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found.",
        )

    # Ensure unique station code per branch
    existing_res = await session.execute(
        select(KitchenStation).where(
            KitchenStation.branch_id == branch_id,
            KitchenStation.code == payload.code.upper().strip(),
        )
    )
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Station '{payload.code.upper().strip()}' already exists.",
        )

    station = KitchenStation(
        organization_id=branch.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        name_en=payload.name_en.strip(),
        name_km=payload.name_km.strip() if payload.name_km else None,
        code=payload.code.upper().strip(),
        station_type=payload.station_type,
        color_hex=payload.color_hex,
        display_order=payload.display_order,
        is_active=payload.is_active,
    )
    session.add(station)
    await session.commit()
    await session.refresh(station)

    logger.info(
        "Kitchen station created",
        station_id=str(station.id),
        code=station.code,
        branch_id=str(branch_id),
    )
    return station


async def list_kitchen_stations(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
) -> list[KitchenStation]:
    """Lists all kitchen stations configured for a branch ordered by display_order."""
    res = await session.execute(
        select(KitchenStation)
        .where(
            KitchenStation.business_id == business_id,
            KitchenStation.branch_id == branch_id,
        )
        .order_by(KitchenStation.display_order.asc(), KitchenStation.created_at.asc())
    )
    return list(res.scalars().all())


async def update_kitchen_station(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    payload: KitchenStationUpdate,
) -> KitchenStation:
    """Updates configuration of a branch kitchen station."""
    res = await session.execute(
        select(KitchenStation).where(
            KitchenStation.id == station_id,
            KitchenStation.business_id == business_id,
            KitchenStation.branch_id == branch_id,
        )
    )
    station = res.scalar_one_or_none()
    if station is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kitchen station not found.",
        )

    if payload.code is not None and payload.code.upper().strip() != station.code:
        code_check = await session.execute(
            select(KitchenStation).where(
                KitchenStation.branch_id == branch_id,
                KitchenStation.code == payload.code.upper().strip(),
                KitchenStation.id != station_id,
            )
        )
        if code_check.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Station code '{payload.code.upper().strip()}' already in use.",
            )
        station.code = payload.code.upper().strip()

    if payload.name_en is not None:
        station.name_en = payload.name_en.strip()
    if payload.name_km is not None:
        station.name_km = payload.name_km.strip() if payload.name_km else None
    if payload.station_type is not None:
        station.station_type = payload.station_type
    if payload.color_hex is not None:
        station.color_hex = payload.color_hex
    if payload.display_order is not None:
        station.display_order = payload.display_order
    if payload.is_active is not None:
        station.is_active = payload.is_active

    await session.commit()
    await session.refresh(station)
    return station


async def delete_kitchen_station(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
) -> None:
    """Deletes or deactivates a kitchen station."""
    res = await session.execute(
        select(KitchenStation).where(
            KitchenStation.id == station_id,
            KitchenStation.business_id == business_id,
            KitchenStation.branch_id == branch_id,
        )
    )
    station = res.scalar_one_or_none()
    if station is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kitchen station not found.",
        )

    await session.delete(station)
    await session.commit()
    logger.info("Kitchen station deleted", station_id=str(station_id))


async def assign_station_to_items_and_categories(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    payload: StationItemAssignRequest,
) -> None:
    """Assigns designated categories and menu items to a kitchen station for routing."""
    res = await session.execute(
        select(KitchenStation).where(
            KitchenStation.id == station_id,
            KitchenStation.business_id == business_id,
            KitchenStation.branch_id == branch_id,
        )
    )
    station = res.scalar_one_or_none()
    if station is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kitchen station not found.",
        )

    if payload.category_ids:
        cats_res = await session.execute(
            select(Category).where(
                Category.id.in_(payload.category_ids),
                Category.business_id == business_id,
            )
        )
        for cat in cats_res.scalars().all():
            cat.kitchen_station_id = station_id

    if payload.menu_item_ids:
        items_res = await session.execute(
            select(MenuItem).where(
                MenuItem.id.in_(payload.menu_item_ids),
                MenuItem.business_id == business_id,
            )
        )
        for item in items_res.scalars().all():
            item.kitchen_station_id = station_id

    await session.commit()
