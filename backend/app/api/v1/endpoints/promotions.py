from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.promotion import (
    DiscountEvaluationResult,
    PromotionCreate,
    PromotionResponse,
    PromotionUpdate,
    ValidatePromoRequest,
)
from app.services.promotion_service import (
    create_promotion,
    delete_promotion,
    evaluate_discount,
    get_promotion_by_id,
    list_promotions,
    update_promotion,
)

router = APIRouter(
    prefix="/businesses/{business_id}/promotions",
    tags=["Discounts & Promotions"],
)


@router.post(
    "",
    response_model=PromotionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new promotion or coupon code",
)
async def create_promotion_endpoint(
    business_id: UUID,
    payload: PromotionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PromotionResponse:
    """Creates a new promotional discount or coupon code for a business."""
    return await create_promotion(
        session=session,
        business_id=business_id,
        payload=payload,
        tenant=tenant,
    )


@router.get(
    "",
    response_model=list[PromotionResponse],
    status_code=status.HTTP_200_OK,
    summary="List promotions for a business",
)
async def list_promotions_endpoint(
    business_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    is_active: Annotated[bool | None, Query(description="Filter by active status")] = None,
    branch_id: Annotated[UUID | None, Query(description="Filter by branch applicability")] = None,
) -> list[PromotionResponse]:
    """Lists all promotions and coupons belonging to the business."""
    return await list_promotions(
        session=session,
        business_id=business_id,
        is_active=is_active,
        branch_id=branch_id,
        tenant=tenant,
    )


@router.get(
    "/{promo_id}",
    response_model=PromotionResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve promotion details",
)
async def get_promotion_endpoint(
    business_id: UUID,
    promo_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PromotionResponse:
    """Retrieves a single promotion by ID."""
    return await get_promotion_by_id(
        session=session,
        business_id=business_id,
        promo_id=promo_id,
        tenant=tenant,
    )


@router.patch(
    "/{promo_id}",
    response_model=PromotionResponse,
    status_code=status.HTTP_200_OK,
    summary="Update promotion settings",
)
async def update_promotion_endpoint(
    business_id: UUID,
    promo_id: UUID,
    payload: PromotionUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PromotionResponse:
    """Updates promotion parameters, expiration, or active status."""
    return await update_promotion(
        session=session,
        business_id=business_id,
        promo_id=promo_id,
        payload=payload,
        tenant=tenant,
    )


@router.delete(
    "/{promo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete promotion",
)
async def delete_promotion_endpoint(
    business_id: UUID,
    promo_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """Deletes a promotion."""
    await delete_promotion(
        session=session,
        business_id=business_id,
        promo_id=promo_id,
        tenant=tenant,
    )


# Additional router for branch-level validation
branch_promo_router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/promotions",
    tags=["Discounts & Promotions"],
)


@branch_promo_router.post(
    "/validate",
    response_model=DiscountEvaluationResult,
    status_code=status.HTTP_200_OK,
    summary="Validate promo code and calculate discount preview",
)
async def validate_promotion_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: ValidatePromoRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> DiscountEvaluationResult:
    """Tests a promo code or manual discount against an order subtotal without saving."""
    return await evaluate_discount(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        subtotal_usd=payload.subtotal_usd,
        promo_code=payload.promo_code,
        manual_discount_type=payload.manual_discount_type,
        manual_discount_value=payload.manual_discount_value,
        discount_reason=payload.discount_reason,
        tenant=tenant,
    )
