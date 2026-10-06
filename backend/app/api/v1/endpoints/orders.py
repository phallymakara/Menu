from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.permissions import (
    Permission,
    require_permission_for_writes,
)
from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.enums import OrderStatus
from app.schemas.billing import BillSummaryResponse
from app.schemas.order import (
    OrderResponse,
    StaffOrderPlacementRequest,
)
from app.services.billing_service import get_order_bill_summary
from app.services.order_placement_service import (
    get_branch_order,
    place_staff_order,
)
from app.services.order_placement_service import (
    list_branch_orders as list_branch_orders_service,
)

router = APIRouter(
    tags=["Orders & POS"],
    dependencies=[Depends(require_permission_for_writes(Permission.TAKE_ORDERS))],
)


@router.post(
    "/businesses/{business_id}/branches/{branch_id}/orders",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Place staff order at table or takeaway",
)
async def create_staff_order(
    business_id: UUID,
    branch_id: UUID,
    payload: StaffOrderPlacementRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OrderResponse:
    """Creates a new order ticket placed by a staff member on POS."""
    try:
        order = await place_staff_order(
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
    return OrderResponse.model_validate(order)


@router.get(
    "/businesses/{business_id}/branches/{branch_id}/orders",
    response_model=list[OrderResponse],
    summary="List branch orders with filters",
)
async def list_branch_orders(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    status_filter: Annotated[OrderStatus | None, Query(alias="status")] = None,
    table_id: Annotated[UUID | None, Query()] = None,
) -> list[OrderResponse]:
    """Lists order tickets for a specific branch."""
    try:
        orders = await list_branch_orders_service(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            status_filter=status_filter,
            table_id=table_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return [OrderResponse.model_validate(o) for o in orders]


@router.get(
    "/businesses/{business_id}/branches/{branch_id}/orders/{order_id}",
    response_model=OrderResponse,
    summary="Get single order details",
)
async def get_order_details(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OrderResponse:
    """Retrieves full details for a single order ticket."""
    try:
        order = await get_branch_order(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            order_id=order_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return OrderResponse.model_validate(order)


@router.get(
    "/businesses/{business_id}/branches/{branch_id}/orders/{order_id}/bill",
    response_model=BillSummaryResponse,
    summary="Get bill summary for a single order ticket",
)
async def get_single_order_bill(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BillSummaryResponse:
    """Retrieves full bill calculation (USD and KHR) for a single order ticket."""
    return await get_order_bill_summary(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
    )
