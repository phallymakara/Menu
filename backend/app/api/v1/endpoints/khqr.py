from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
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
from app.schemas.khqr import (
    DynamicKHQRRequest,
    DynamicKHQRResponse,
    KHQRPaymentAttemptResponse,
    KHQRResponse,
)
from app.services.khqr_service import (
    generate_dynamic_order_khqr,
    generate_dynamic_session_khqr,
    generate_static_merchant_khqr,
    refresh_khqr_attempt,
)

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/khqr",
    tags=["KHQR Digital Payments (Bakong)"],
    dependencies=[Depends(require_permission_for_writes(Permission.TAKE_PAYMENTS))],
)


@router.post(
    "/table-sessions/{session_id}/dynamic",
    response_model=DynamicKHQRResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate dynamic KHQR for an active table session bill",
)
async def generate_session_khqr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    session_id: UUID,
    payload: DynamicKHQRRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> DynamicKHQRResponse:
    """
    Calculates the exact dynamic table session bill and generates an official
    EMVCo-compliant Bakong KHQR code with embedded payable amount and expiry.

    The KHQR is recorded as a pending payment attempt. Poll
    ``GET .../khqr/attempts/{attempt_id}`` and settle the bill with the
    ``attempt_id`` once Bakong reports the payment. Returns 409 when the branch
    and business have no Bakong account configured.
    """
    with payment_error_responses():
        return await generate_dynamic_session_khqr(
            session=session,
            business_id=business_id,
            branch_id=branch_id,
            table_session_id=session_id,
            currency=payload.currency,
            promo_code=payload.promo_code,
            manual_discount_type=payload.manual_discount_type,
            manual_discount_value=payload.manual_discount_value,
            discount_reason=payload.discount_reason,
            tenant=tenant,
            created_by_user_id=current_user.id,
        )


@router.post(
    "/orders/{order_id}/dynamic",
    response_model=DynamicKHQRResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate dynamic KHQR for a takeaway/single order bill",
)
async def generate_order_khqr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: DynamicKHQRRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> DynamicKHQRResponse:
    """
    Calculates the exact takeaway/single order bill and generates an official
    EMVCo-compliant Bakong KHQR code with embedded payable amount and expiry.

    The KHQR is recorded as a pending payment attempt, as for table sessions.
    """
    with payment_error_responses():
        return await generate_dynamic_order_khqr(
            session=session,
            business_id=business_id,
            branch_id=branch_id,
            order_id=order_id,
            currency=payload.currency,
            promo_code=payload.promo_code,
            manual_discount_type=payload.manual_discount_type,
            manual_discount_value=payload.manual_discount_value,
            discount_reason=payload.discount_reason,
            tenant=tenant,
            created_by_user_id=current_user.id,
        )


@router.get(
    "/attempts/{attempt_id}",
    response_model=KHQRPaymentAttemptResponse,
    status_code=status.HTTP_200_OK,
    summary="Check and refresh the status of a KHQR payment attempt",
)
async def get_khqr_attempt_endpoint(
    business_id: UUID,
    branch_id: UUID,
    attempt_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    bakong_client: Annotated[BakongClient | None, Depends(get_bakong_client)],
) -> KHQRPaymentAttemptResponse:
    """
    Returns a KHQR payment attempt. A pending attempt is first checked with
    Bakong (check transaction by MD5) and updated to succeeded, failed or
    expired. This endpoint never settles the bill; call the KHQR payment
    endpoint with the attempt ID for that. Returns 503 when Bakong cannot be
    reached.
    """
    with payment_error_responses():
        return await refresh_khqr_attempt(
            session=session,
            business_id=business_id,
            branch_id=branch_id,
            attempt_id=attempt_id,
            tenant=tenant,
            bakong_client=bakong_client,
        )


@router.get(
    "/static",
    response_model=KHQRResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate static merchant KHQR code",
)
async def generate_static_khqr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    currency: Annotated[
        Literal["USD", "KHR"], Query(description="Default currency for static QR")
    ] = "USD",
) -> KHQRResponse:
    """
    Generates a static merchant KHQR code for acrylic table stands or counter
    stickers. Payments to a static KHQR cannot be verified with Bakong and need a
    manual confirmation by an owner or manager.
    """
    with payment_error_responses():
        return await generate_static_merchant_khqr(
            session=session,
            business_id=business_id,
            branch_id=branch_id,
            currency=currency,
            tenant=tenant,
        )
