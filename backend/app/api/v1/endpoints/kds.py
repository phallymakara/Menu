from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.kds import (
    CourseFireRequest,
    ItemRerouteRequest,
    ItemStatusBumpRequest,
    KDSTicketItemResponse,
    KDSTicketResponse,
    StationMetricsResponse,
    StationTicketBumpRequest,
)
from app.services.kds_service import (
    bump_item_status,
    bump_station_ticket,
    fire_course,
    get_expediter_tickets,
    get_station_metrics,
    get_station_tickets,
    recall_station_tickets,
    reroute_item_station,
    undo_item_status,
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
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[KDSTicketResponse]:
    """Retrieves live pending and cooking tickets routed to this station screen."""
    return await get_station_tickets(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        station_id=station_id,
    )


@router.get(
    "/stations/{station_id}/metrics",
    response_model=StationMetricsResponse,
    summary="Get real-time station metrics (active, overdue, avg prep time)",
)
async def get_station_metrics_endpoint(
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StationMetricsResponse:
    """Retrieves live metrics for kitchen station header."""
    return await get_station_metrics(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        station_id=station_id,
    )


@router.get(
    "/stations/{station_id}/recall",
    response_model=list[KDSTicketResponse],
    summary="Recall recently completed/served tickets for a kitchen station",
)
async def recall_station_tickets_endpoint(
    business_id: UUID,
    branch_id: UUID,
    station_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    minutes_history: int = Query(default=15, ge=1, le=120),
) -> list[KDSTicketResponse]:
    """Fetches recently completed tickets to allow review or un-bumping."""
    return await recall_station_tickets(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        station_id=station_id,
        minutes_history=minutes_history,
    )


@router.get(
    "/expo/tickets",
    response_model=list[KDSTicketResponse],
    summary="Get Expediter (Master Pass) consolidated tickets overview",
)
async def get_expediter_tickets_endpoint(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[KDSTicketResponse]:
    """Retrieves consolidated multi-station tickets for the head chef / expediter."""
    return await get_expediter_tickets(
        session=session,
        tenant=tenant,
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
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KDSTicketItemResponse:
    """Transitions an item status (COOKING, READY_TO_SERVE, SERVED, VOIDED)."""
    return await bump_item_status(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        order_item_id=order_item_id,
        payload=payload,
    )


@router.post(
    "/orders/{order_id}/station/{station_id}/bump",
    response_model=KDSTicketResponse,
    summary="Bump all items for a station on a single order ticket at once",
)
async def bump_station_ticket_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    station_id: UUID,
    payload: StationTicketBumpRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KDSTicketResponse:
    """Bumps all dishes belonging to this station on the specified ticket."""
    return await bump_station_ticket(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        station_id=station_id,
        payload=payload,
    )


@router.post(
    "/items/{order_item_id}/undo",
    response_model=KDSTicketItemResponse,
    summary="Revert dish item status back to PREPARING",
)
async def undo_item_status_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KDSTicketItemResponse:
    """Reverts an accidentally bumped item back to cooking/preparing."""
    return await undo_item_status(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        order_item_id=order_item_id,
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
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[KDSTicketItemResponse]:
    """Fires all held items in an order ticket under a course stage."""
    return await fire_course(
        session=session,
        tenant=tenant,
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
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> KDSTicketItemResponse:
    """Dynamically re-assigns an item to a different station screen."""
    return await reroute_item_station(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        order_item_id=order_item_id,
        payload=payload,
    )
