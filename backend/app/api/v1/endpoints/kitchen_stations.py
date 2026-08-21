from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.models.user import User
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
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KitchenStationResponse:
    """Creates a new kitchen station (e.g. Bar, Grill, Hot Wok, Pastry, Expo)."""
    station = await create_kitchen_station(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        payload=payload,
    )
    return KitchenStationResponse.model_validate(station)


@router.get(
    "",
    response_model=list[KitchenStationResponse],
    summary="List all kitchen stations for branch",
)
async def list_kitchen_stations_endpoint(
    business_id: UUID,
    branch_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[KitchenStationResponse]:
    """Lists all configured kitchen stations for a branch."""
    stations = await list_kitchen_stations(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
    )
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
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KitchenStationResponse:
    """Updates configuration of a branch kitchen station."""
    station = await update_kitchen_station(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        station_id=station_id,
        payload=payload,
    )
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
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Deletes a kitchen station."""
    await delete_kitchen_station(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        station_id=station_id,
    )


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
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, str]:
    """Bulk-assigns categories and dishes to this preparation station."""
    await assign_station_to_items_and_categories(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        station_id=station_id,
        payload=payload,
    )
    return {
        "message": "Categories and menu items assigned to kitchen station successfully."
    }
