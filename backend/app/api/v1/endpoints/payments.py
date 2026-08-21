from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.payment import (
    CashPaymentRequest,
    KHQRPaymentRequest,
    PaymentResponse,
)
from app.services.payment_service import (
    get_payment_by_id,
    settle_single_order_cash_payment,
    settle_single_order_khqr_payment,
    settle_table_session_cash_payment,
    settle_table_session_khqr_payment,
)

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}",
    tags=["Payments & POS Settlement"],
)


@router.post(
    "/table-sessions/{session_id}/payments/cash",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cashier settles dine-in session bill with cash",
)
async def settle_table_session_cash_endpoint(
    business_id: UUID,
    branch_id: UUID,
    session_id: UUID,
    payload: CashPaymentRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PaymentResponse:
    """
    Settles a dine-in table session with mixed cash tender (USD and/or KHR),
    calculates change returned, closes table session, and marks table as dirty_cleaning.
    """
    return await settle_table_session_cash_payment(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=session_id,
        payload=payload,
        current_user=current_user,
        tenant=tenant,
    )


@router.post(
    "/table-sessions/{session_id}/payments/khqr",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm dine-in session bill paid via KHQR (Bakong)",
)
async def settle_table_session_khqr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    session_id: UUID,
    payload: KHQRPaymentRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PaymentResponse:
    """
    Settles a dine-in table session via KHQR (Bakong), closes table session,
    marks table as dirty_cleaning, and sends real-time Telegram notification to staff.
    """
    return await settle_table_session_khqr_payment(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=session_id,
        payload=payload,
        current_user=current_user,
        tenant=tenant,
    )


@router.post(
    "/orders/{order_id}/payments/cash",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cashier settles standalone / takeaway order with cash",
)
async def settle_single_order_cash_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: CashPaymentRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PaymentResponse:
    """
    Settles a standalone or takeaway order with cash tender and computes change.
    """
    return await settle_single_order_cash_payment(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        payload=payload,
        current_user=current_user,
        tenant=tenant,
    )


@router.post(
    "/orders/{order_id}/payments/khqr",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm standalone / takeaway order paid via KHQR (Bakong)",
)
async def settle_single_order_khqr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: KHQRPaymentRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PaymentResponse:
    """
    Settles a standalone or takeaway order via KHQR and dispatches Telegram notification.
    """
    return await settle_single_order_khqr_payment(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        payload=payload,
        current_user=current_user,
        tenant=tenant,
    )


@router.get(
    "/payments/{payment_id}",
    response_model=PaymentResponse,
    status_code=status.HTTP_200_OK,
    summary="Get payment transaction receipt details",
)
async def get_payment_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payment_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PaymentResponse:
    """
    Retrieves full financial record for a completed payment transaction.
    """
    return await get_payment_by_id(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        payment_id=payment_id,
        tenant=tenant,
    )

