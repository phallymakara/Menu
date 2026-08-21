from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.khqr import DynamicKHQRRequest, KHQRResponse
from app.services.khqr_service import (
    _resolve_bakong_merchant_info,
    build_khqr_payload,
    generate_dynamic_order_khqr,
    generate_dynamic_session_khqr,
    generate_qr_image_data_url,
)

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/khqr",
    tags=["KHQR Digital Payments (Bakong)"],
)


@router.post(
    "/table-sessions/{session_id}/dynamic",
    response_model=KHQRResponse,
    status_code=status.HTTP_200_OK,
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
) -> KHQRResponse:
    """
    Calculates the exact dynamic table session bill and generates an official
    EMVCo-compliant Bakong KHQR code with embedded payable amount.
    """
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
    )


@router.post(
    "/orders/{order_id}/dynamic",
    response_model=KHQRResponse,
    status_code=status.HTTP_200_OK,
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
) -> KHQRResponse:
    """
    Calculates the exact takeaway/single order bill and generates an official
    EMVCo-compliant Bakong KHQR code with embedded payable amount.
    """
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
    currency: Annotated[Literal["USD", "KHR"], Query(description="Default currency for static QR")] = "USD",
) -> KHQRResponse:
    """
    Generates a static merchant KHQR code for acrylic table stands or counter stickers.
    """
    account_id, merchant_name, merchant_city, acquiring_bank = await _resolve_bakong_merchant_info(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
    )

    qr_str = build_khqr_payload(
        bakong_account_id=account_id,
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        acquiring_bank=acquiring_bank,
        amount=None,
        currency=currency,
        bill_number=None,
        terminal_label="STATIC",
        is_dynamic=False,
    )

    qr_image = generate_qr_image_data_url(qr_str)
    deep_link = f"bakong://qr?data={qr_str}"

    return KHQRResponse(
        qr_string=qr_str,
        qr_image_data_url=qr_image,
        currency=currency,
        amount=0,
        amount_usd=0,
        amount_khr=0,
        exchange_rate=4100,
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        bakong_account_id=account_id,
        bill_reference="STATIC-MERCHANT",
        deep_link_url=deep_link,
    )
