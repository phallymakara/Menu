from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.kds import (
    CourseFireRequest,
    ItemRerouteRequest,
    ItemStatusBumpRequest,
    KDSTicketItemResponse,
    KDSTicketResponse,
)
from app.services.kds_service import (
    bump_item_status,
    fire_course,
    get_expediter_tickets,
    get_station_tickets,
    reroute_item_station,
)

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/kds",
    tags=["Kitchen Display System (KDS)"],
)


@router.get(
    "/stations/{station_id}/tickets",
    response_model=list[KDSTicketResponse],
    summary="Get live active tickets for a kitchen station",
)
async def get_station_tickets_endpoint(
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[KDSTicketResponse]:
    """Retrieves live pending and cooking tickets routed to this station screen."""
    return await get_station_tickets(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        station_id=station_id,
    )


@router.get(
    "/expo/tickets",
    response_model=list[KDSTicketResponse],
    summary="Get Expediter (Master Pass) consolidated tickets overview",
)
async def get_expediter_tickets_endpoint(
    business_id: UUID,
    branch_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[KDSTicketResponse]:
    """Retrieves consolidated multi-station tickets for the head chef / expediter."""
    return await get_expediter_tickets(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
    )


@router.post(
    "/items/{order_item_id}/bump",
    response_model=KDSTicketItemResponse,
    summary="Bump dish item status on kitchen display screen",
)
async def bump_item_status_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_item_id: UUID,
    payload: ItemStatusBumpRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KDSTicketItemResponse:
    """Transitions an item status (COOKING, READY_TO_SERVE, SERVED, VOIDED)."""
    return await bump_item_status(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_item_id=order_item_id,
        payload=payload,
    )


@router.post(
    "/orders/{order_id}/fire",
    response_model=list[KDSTicketItemResponse],
    summary="Fire held course items (e.g. Fire Mains or Fire Desserts)",
)
async def fire_course_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: CourseFireRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[KDSTicketItemResponse]:
    """Fires all held items in an order ticket under a course stage."""
    return await fire_course(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        payload=payload,
    )


@router.post(
    "/items/{order_item_id}/reroute",
    response_model=KDSTicketItemResponse,
    summary="Re-route dish item to another kitchen station",
)
async def reroute_item_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_item_id: UUID,
    payload: ItemRerouteRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KDSTicketItemResponse:
    """Dynamically re-assigns an item to a different station screen."""
    return await reroute_item_station(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_item_id=order_item_id,
        payload=payload,
    )
