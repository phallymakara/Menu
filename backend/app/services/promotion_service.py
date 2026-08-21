from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant import TenantContext
from app.models.business import Business
from app.models.enums import DiscountType
from app.models.promotion import Promotion
from app.schemas.promotion import (
    DiscountEvaluationResult,
    PromotionCreate,
    PromotionResponse,
    PromotionUpdate,
)

logger = structlog.get_logger("app.services.promotion_service")


async def create_promotion(
    session: AsyncSession,
    business_id: UUID,
    payload: PromotionCreate,
    tenant: TenantContext | None = None,
) -> PromotionResponse:
    """Creates a new promotion or coupon code for a business."""
    # 1. Verify business
    biz_query = select(Business).where(Business.id == business_id)
    if tenant:
        biz_query = biz_query.where(Business.organization_id == tenant.organization_id)
    biz_res = await session.execute(biz_query)
    business = biz_res.scalar_one_or_none()
    if business is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found.",
        )

    # 2. If promo code supplied, ensure unique within business
    if payload.code:
        code_clean = payload.code.strip().upper()
        existing_query = select(Promotion).where(
            Promotion.business_id == business_id,
            Promotion.code == code_clean,
            Promotion.is_active.is_(True),
        )
        existing_res = await session.execute(existing_query)
        if existing_res.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Active promotion with code '{code_clean}' already exists.",
            )
    else:
        code_clean = None

    promo = Promotion(
        organization_id=business.organization_id,
        business_id=business_id,
        branch_id=payload.branch_id,
        name_en=payload.name_en,
        name_km=payload.name_km,
        code=code_clean,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        max_discount_amount_usd=payload.max_discount_amount_usd,
        minimum_spend_usd=payload.minimum_spend_usd,
        usage_limit=payload.usage_limit,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_active=payload.is_active,
    )
    session.add(promo)
    await session.commit()
    await session.refresh(promo)

    return PromotionResponse.model_validate(promo)


async def list_promotions(
    session: AsyncSession,
    business_id: UUID,
    is_active: bool | None = None,
    branch_id: UUID | None = None,
    tenant: TenantContext | None = None,
) -> list[PromotionResponse]:
    """Lists promotions for a business with optional active/branch filters."""
    query = select(Promotion).where(Promotion.business_id == business_id)
    if tenant:
        query = query.where(Promotion.organization_id == tenant.organization_id)
    if is_active is not None:
        query = query.where(Promotion.is_active == is_active)
    if branch_id is not None:
        query = query.where((Promotion.branch_id.is_(None)) | (Promotion.branch_id == branch_id))

    query = query.order_by(Promotion.created_at.desc())
    res = await session.execute(query)
    promotions = res.scalars().all()
    return [PromotionResponse.model_validate(p) for p in promotions]


async def get_promotion_by_id(
    session: AsyncSession,
    business_id: UUID,
    promo_id: UUID,
    tenant: TenantContext | None = None,
) -> PromotionResponse:
    """Retrieves a single promotion by ID."""
    query = select(Promotion).where(
        Promotion.id == promo_id,
        Promotion.business_id == business_id,
    )
    if tenant:
        query = query.where(Promotion.organization_id == tenant.organization_id)

    res = await session.execute(query)
    promo = res.scalar_one_or_none()
    if promo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Promotion not found.",
        )
    return PromotionResponse.model_validate(promo)


async def update_promotion(
    session: AsyncSession,
    business_id: UUID,
    promo_id: UUID,
    payload: PromotionUpdate,
    tenant: TenantContext | None = None,
) -> PromotionResponse:
    """Updates an existing promotion."""
    query = select(Promotion).where(
        Promotion.id == promo_id,
        Promotion.business_id == business_id,
    )
    if tenant:
        query = query.where(Promotion.organization_id == tenant.organization_id)

    res = await session.execute(query)
    promo = res.scalar_one_or_none()
    if promo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Promotion not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "code" in update_data and update_data["code"]:
        update_data["code"] = update_data["code"].strip().upper()

    for k, v in update_data.items():
        setattr(promo, k, v)

    await session.commit()
    await session.refresh(promo)
    return PromotionResponse.model_validate(promo)


async def delete_promotion(
    session: AsyncSession,
    business_id: UUID,
    promo_id: UUID,
    tenant: TenantContext | None = None,
) -> None:
    """Deactivates/removes a promotion."""
    query = select(Promotion).where(
        Promotion.id == promo_id,
        Promotion.business_id == business_id,
    )
    if tenant:
        query = query.where(Promotion.organization_id == tenant.organization_id)

    res = await session.execute(query)
    promo = res.scalar_one_or_none()
    if promo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Promotion not found.",
        )

    await session.delete(promo)
    await session.commit()


async def evaluate_discount(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    subtotal_usd: Decimal,
    promo_code: str | None = None,
    manual_discount_type: DiscountType | None = None,
    manual_discount_value: Decimal | None = None,
    discount_reason: str | None = None,
    tenant: TenantContext | None = None,
) -> DiscountEvaluationResult:
    """
    Evaluates promo code or manual cashier discount against an active subtotal.
    Returns calculated discount amount in USD, percentage (if applicable), and promotion metadata.
    """
    if promo_code:
        clean_code = promo_code.strip().upper()
        query = select(Promotion).where(
            Promotion.business_id == business_id,
            Promotion.code == clean_code,
            Promotion.is_active.is_(True),
        )
        if tenant:
            query = query.where(Promotion.organization_id == tenant.organization_id)

        res = await session.execute(query)
        promo = res.scalar_one_or_none()
        if promo is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Promo code '{clean_code}' is invalid or inactive.",
            )

        # Branch eligibility
        if promo.branch_id and promo.branch_id != branch_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Promo code '{clean_code}' is not valid for this branch.",
            )

        # Date validity
        now_utc = datetime.now(timezone.utc)
        if promo.start_date and promo.start_date > now_utc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Promo code '{clean_code}' is not active yet.",
            )
        if promo.end_date and promo.end_date < now_utc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Promo code '{clean_code}' has expired.",
            )

        # Usage limit
        if promo.usage_limit is not None and promo.current_usage_count >= promo.usage_limit:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Promo code '{clean_code}' has reached its maximum usage limit.",
            )

        # Minimum spend
        if subtotal_usd < promo.minimum_spend_usd:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Order subtotal ${subtotal_usd:.2f} does not meet minimum spend of ${promo.minimum_spend_usd:.2f} for '{clean_code}'.",
            )

        # Calculate discount
        if promo.discount_type == DiscountType.PERCENTAGE:
            calc_val = (subtotal_usd * (promo.discount_value / Decimal("100"))).quantize(Decimal("0.01"))
            if promo.max_discount_amount_usd is not None:
                calc_val = min(calc_val, promo.max_discount_amount_usd)
            discount_usd = min(subtotal_usd, calc_val)
            discount_pct = promo.discount_value
        else:  # FIXED_AMOUNT
            discount_usd = min(subtotal_usd, promo.discount_value)
            discount_pct = None

        return DiscountEvaluationResult(
            is_valid=True,
            discount_usd=discount_usd,
            discount_percent=discount_pct,
            discount_reason=f"{promo.name_en} ({clean_code})",
            promotion_id=promo.id,
            message="Promotion applied successfully.",
        )

    elif manual_discount_type is not None and manual_discount_value is not None and manual_discount_value > 0:
        if manual_discount_type == DiscountType.PERCENTAGE:
            calc_val = (subtotal_usd * (manual_discount_value / Decimal("100"))).quantize(Decimal("0.01"))
            discount_usd = min(subtotal_usd, calc_val)
            discount_pct = manual_discount_value
        else:  # FIXED_AMOUNT
            discount_usd = min(subtotal_usd, manual_discount_value)
            discount_pct = None

        return DiscountEvaluationResult(
            is_valid=True,
            discount_usd=discount_usd,
            discount_percent=discount_pct,
            discount_reason=str(discount_reason or "Manual Discount"),
            promotion_id=None,
            message="Manual discount applied.",
        )

    return DiscountEvaluationResult(
        is_valid=True,
        discount_usd=Decimal("0.00"),
        discount_percent=None,
        discount_reason=None,
        promotion_id=None,
        message="No discount applied.",
    )
