from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.order_void import (
    CancelOrderRequest,
    CancelOrderResponse,
    VoidOrderItemRequest,
    VoidOrderItemResponse,
)
from app.services.order_void_service import (
    cancel_entire_order_round,
    void_order_line_item,
)

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/orders/{order_id}",
    tags=["Order Void & Cancellation"],
)


@router.post(
    "/items/{item_id}/void",
    response_model=VoidOrderItemResponse,
    status_code=status.HTTP_200_OK,
    summary="Authorize and void an individual order line item",
)
async def void_order_item_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    item_id: UUID,
    payload: VoidOrderItemRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> VoidOrderItemResponse:
    """
    Voids an individual line item in an active order round with a mandatory standardized reason code.
    Requires Owner, Manager, or Cashier role.
    """
    return await void_order_line_item(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        item_id=item_id,
        payload=payload,
        current_user=current_user,
        tenant=tenant,
    )


@router.post(
    "/cancel",
    response_model=CancelOrderResponse,
    status_code=status.HTTP_200_OK,
    summary="Authorize and cancel an entire order round",
)
async def cancel_order_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: CancelOrderRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CancelOrderResponse:
    """
    Cancels an entire active order round and voids all of its active line items with a standardized reason code.
    Requires Owner, Manager, or Cashier role.
    """
    return await cancel_entire_order_round(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        payload=payload,
        current_user=current_user,
        tenant=tenant,
    )
