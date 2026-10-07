from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.bakong import get_bakong_client
from app.api.dependencies.permissions import (
    Permission,
    require_permission_for_writes,
)
from app.api.dependencies.tenant import get_current_tenant_context
from app.api.payment_errors import payment_error_responses
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.integrations.bakong import BakongClient
from app.models.user import User
from app.schemas.payment import (
    CashPaymentRequest,
    KHQRManualConfirmationRequest,
    KHQRPaymentRequest,
    PaymentResponse,
)
from app.services.payment_service import (
    confirm_order_khqr_payment_manually,
    confirm_table_session_khqr_payment_manually,
    get_payment_by_id,
    settle_single_order_cash_payment,
    settle_single_order_khqr_payment,
    settle_table_session_cash_payment,
    settle_table_session_khqr_payment,
)

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}",
    tags=["Payments & POS Settlement"],
    dependencies=[Depends(require_permission_for_writes(Permission.TAKE_PAYMENTS))],
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
    summary="Settle dine-in session bill with a Bakong-verified KHQR payment",
)
async def settle_table_session_khqr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    session_id: UUID,
    payload: KHQRPaymentRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    bakong_client: Annotated[BakongClient | None, Depends(get_bakong_client)],
) -> PaymentResponse:
    """
    Settles a dine-in table session from a KHQR payment attempt once Bakong
    confirms the money was received, closes the session, marks the table as
    dirty_cleaning, and notifies staff on Telegram.

    Returns 409 "payment not received yet" while Bakong has no payment for the
    KHQR (retry later), 409 when the KHQR expired or no longer matches the bill,
    and 503 when Bakong verification is not configured or not reachable.
    """
    with payment_error_responses():
        return await settle_table_session_khqr_payment(
            session=session,
            business_id=business_id,
            branch_id=branch_id,
            table_session_id=session_id,
            payload=payload,
            current_user=current_user,
            tenant=tenant,
            bakong_client=bakong_client,
        )


@router.post(
    "/table-sessions/{session_id}/payments/khqr/manual-confirmation",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Owner or manager confirms a dine-in KHQR payment without Bakong",
)
async def confirm_table_session_khqr_manually_endpoint(
    business_id: UUID,
    branch_id: UUID,
    session_id: UUID,
    payload: KHQRManualConfirmationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PaymentResponse:
    """
    Manual override for when Bakong verification is not configured or does not
    show a payment the customer made. Requires the owner or manager role and a
    reason; the Payment is marked as manually confirmed and the override is
    recorded in the audit log.
    """
    with payment_error_responses():
        return await confirm_table_session_khqr_payment_manually(
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
    summary="Settle standalone / takeaway order with a Bakong-verified KHQR payment",
)
async def settle_single_order_khqr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: KHQRPaymentRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    bakong_client: Annotated[BakongClient | None, Depends(get_bakong_client)],
) -> PaymentResponse:
    """
    Settles a standalone or takeaway order from a KHQR payment attempt once
    Bakong confirms the money was received, and notifies staff on Telegram.
    Errors are the same as for table sessions.
    """
    with payment_error_responses():
        return await settle_single_order_khqr_payment(
            session=session,
            business_id=business_id,
            branch_id=branch_id,
            order_id=order_id,
            payload=payload,
            current_user=current_user,
            tenant=tenant,
            bakong_client=bakong_client,
        )


@router.post(
    "/orders/{order_id}/payments/khqr/manual-confirmation",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Owner or manager confirms a takeaway KHQR payment without Bakong",
)
async def confirm_order_khqr_manually_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: KHQRManualConfirmationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PaymentResponse:
    """
    Manual override for a standalone or takeaway order. Requires the owner or
    manager role and a reason; the Payment is marked as manually confirmed and
    the override is recorded in the audit log.
    """
    with payment_error_responses():
        return await confirm_order_khqr_payment_manually(
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
