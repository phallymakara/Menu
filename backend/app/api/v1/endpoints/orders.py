from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies.auth import get_current_user
from app.db.session import get_db_session
from app.models.enums import OrderStatus
from app.models.order import Order, OrderItem
from app.models.user import User
from app.schemas.order import (
    OrderResponse,
    StaffOrderPlacementRequest,
)
from app.services.order_placement_service import place_staff_order

router = APIRouter(
    tags=["Orders & POS"],
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
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OrderResponse:
    """Creates a new order ticket placed by a staff member on POS."""
    order = await place_staff_order(
        session=session,
        branch_id=branch_id,
        current_user=current_user,
        payload=payload,
    )
    return OrderResponse.model_validate(order)


@router.get(
    "/businesses/{business_id}/branches/{branch_id}/orders",
    response_model=list[OrderResponse],
    summary="List branch orders with filters",
)
async def list_branch_orders(
    business_id: UUID,
    branch_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    status_filter: Annotated[OrderStatus | None, Query(alias="status")] = None,
    table_id: Annotated[UUID | None, Query()] = None,
) -> list[OrderResponse]:
    """Lists order tickets for a specific branch."""
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
        )
        .where(
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
        .order_by(Order.created_at.desc())
    )

    if status_filter is not None:
        stmt = stmt.where(Order.status == status_filter)
    if table_id is not None:
        stmt = stmt.where(Order.table_id == table_id)

    res = await session.execute(stmt)
    orders = list(res.scalars().all())
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
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OrderResponse:
    """Retrieves full details for a single order ticket."""
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
        )
        .where(
            Order.id == order_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
    )
    res = await session.execute(stmt)
    order = res.scalar_one_or_none()
    if order is None:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order ticket not found.",
        )
    return OrderResponse.model_validate(order)
