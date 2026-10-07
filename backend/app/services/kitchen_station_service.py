from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.category import Category
from app.models.kitchen_station import KitchenStation
from app.models.menu_item import MenuItem
from app.schemas.kitchen_station import (
    KitchenStationCreate,
    KitchenStationUpdate,
    StationItemAssignRequest,
)
from app.services.tenancy import get_branch_for_tenant

logger = structlog.get_logger("app.services.kitchen_station_service")


async def _get_station_for_tenant(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
) -> KitchenStation:
    """
    Load a kitchen station of the given branch within the caller's organization.

    Raises:
        TenantNotFoundError: If the station does not exist in this branch, or the
            branch belongs to another organization.
    """
    res = await session.execute(
        select(KitchenStation).where(
            KitchenStation.id == station_id,
            KitchenStation.business_id == business_id,
            KitchenStation.branch_id == branch_id,
            KitchenStation.organization_id == tenant.organization_id,
        )
    )
    station = res.scalar_one_or_none()
    if station is None:
        raise TenantNotFoundError("Kitchen station not found.")
    return station


async def create_kitchen_station(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: KitchenStationCreate,
) -> KitchenStation:
    """
    Creates a new custom kitchen station for a branch of the caller's organization.

    Raises:
        TenantNotFoundError: If the branch is not part of the business and tenant.
        HTTPException (409): If the station code is already used in this branch.
    """
    branch = await get_branch_for_tenant(session, tenant, business_id, branch_id)

    # Ensure unique station code per branch
    existing_res = await session.execute(
        select(KitchenStation).where(
            KitchenStation.organization_id == tenant.organization_id,
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
        organization_id=str(tenant.organization_id),
    )
    return station


async def list_kitchen_stations(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
) -> list[KitchenStation]:
    """
    Lists all kitchen stations configured for a branch ordered by display_order.

    Raises:
        TenantNotFoundError: If the branch is not part of the business and tenant.
    """
    await get_branch_for_tenant(session, tenant, business_id, branch_id)

    res = await session.execute(
        select(KitchenStation)
        .where(
            KitchenStation.organization_id == tenant.organization_id,
            KitchenStation.business_id == business_id,
            KitchenStation.branch_id == branch_id,
        )
        .order_by(KitchenStation.display_order.asc(), KitchenStation.created_at.asc())
    )
    return list(res.scalars().all())


async def update_kitchen_station(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    payload: KitchenStationUpdate,
) -> KitchenStation:
    """
    Updates configuration of a branch kitchen station owned by the caller's organization.

    Raises:
        TenantNotFoundError: If the station is not in this branch and tenant.
        HTTPException (409): If the new station code is already used in this branch.
    """
    station = await _get_station_for_tenant(
        session, tenant, business_id, branch_id, station_id
    )

    if payload.code is not None and payload.code.upper().strip() != station.code:
        code_check = await session.execute(
            select(KitchenStation).where(
                KitchenStation.organization_id == tenant.organization_id,
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
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
) -> None:
    """
    Deletes a kitchen station owned by the caller's organization.

    Raises:
        TenantNotFoundError: If the station is not in this branch and tenant.
    """
    station = await _get_station_for_tenant(
        session, tenant, business_id, branch_id, station_id
    )

    await session.delete(station)
    await session.commit()
    logger.info(
        "Kitchen station deleted",
        station_id=str(station_id),
        organization_id=str(tenant.organization_id),
    )


async def assign_station_to_items_and_categories(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    payload: StationItemAssignRequest,
) -> None:
    """
    Assigns designated categories and menu items to a kitchen station for routing.

    Only categories and menu items of the caller's organization and of this
    business are updated; IDs that do not match are ignored.

    Raises:
        TenantNotFoundError: If the station is not in this branch and tenant.
    """
    await _get_station_for_tenant(session, tenant, business_id, branch_id, station_id)

    if payload.category_ids:
        cats_res = await session.execute(
            select(Category).where(
                Category.id.in_(payload.category_ids),
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
            )
        )
        for cat in cats_res.scalars().all():
            cat.kitchen_station_id = station_id

    if payload.menu_item_ids:
        items_res = await session.execute(
            select(MenuItem).where(
                MenuItem.id.in_(payload.menu_item_ids),
                MenuItem.business_id == business_id,
                MenuItem.organization_id == tenant.organization_id,
            )
        )
        for item in items_res.scalars().all():
            item.kitchen_station_id = station_id

    await session.commit()
