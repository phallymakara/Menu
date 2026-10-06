from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.kitchen_station import (
    KitchenStationCreate,
    KitchenStationResponse,
    KitchenStationUpdate,
    StationItemAssignRequest,
)
from app.services.kitchen_station_service import (
    assign_station_to_items_and_categories,
    create_kitchen_station,
    delete_kitchen_station,
    list_kitchen_stations,
    update_kitchen_station,
)

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/kitchen-stations",
    tags=["Kitchen Stations"],
)


@router.post(
    "",
    response_model=KitchenStationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create custom kitchen station for branch",
)
async def create_kitchen_station_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: KitchenStationCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KitchenStationResponse:
    """Creates a new kitchen station (e.g. Bar, Grill, Hot Wok, Pastry, Expo)."""
    try:
        station = await create_kitchen_station(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return KitchenStationResponse.model_validate(station)


@router.get(
    "",
    response_model=list[KitchenStationResponse],
    summary="List all kitchen stations for branch",
)
async def list_kitchen_stations_endpoint(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[KitchenStationResponse]:
    """Lists all configured kitchen stations for a branch."""
    try:
        stations = await list_kitchen_stations(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return [KitchenStationResponse.model_validate(s) for s in stations]


@router.put(
    "/{station_id}",
    response_model=KitchenStationResponse,
    summary="Update kitchen station configuration",
)
async def update_kitchen_station_endpoint(
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    payload: KitchenStationUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KitchenStationResponse:
    """Updates configuration of a branch kitchen station."""
    try:
        station = await update_kitchen_station(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            station_id=station_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return KitchenStationResponse.model_validate(station)


@router.delete(
    "/{station_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete kitchen station",
)
async def delete_kitchen_station_endpoint(
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Deletes a kitchen station."""
    try:
        await delete_kitchen_station(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            station_id=station_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/{station_id}/assignments",
    status_code=status.HTTP_200_OK,
    summary="Assign categories and menu items to kitchen station",
)
async def assign_station_items_endpoint(
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    payload: StationItemAssignRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    """Bulk-assigns categories and dishes to this preparation station."""
    try:
        await assign_station_to_items_and_categories(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            station_id=station_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return {
        "message": "Categories and menu items assigned to kitchen station successfully."
    }
