from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DiscountReason, DiscountType


class PromotionCreate(BaseModel):
    """Payload to create a new promotion or coupon code."""

    name_en: str = Field(..., max_length=100, description="Promotion English name")
    name_km: str | None = Field(default=None, max_length=100, description="Promotion Khmer name")
    code: str | None = Field(default=None, max_length=50, description="Optional coupon code (e.g. WELCOME15)")
    branch_id: UUID | None = Field(default=None, description="Optional branch restriction (null for all branches)")
    discount_type: DiscountType = Field(default=DiscountType.PERCENTAGE)
    discount_value: Decimal = Field(..., gt=0, description="Percentage (e.g. 15.00) or fixed amount (e.g. 5.00)")
    max_discount_amount_usd: Decimal | None = Field(default=None, ge=0, description="Max dollar cap for percentage discounts")
    minimum_spend_usd: Decimal = Field(default=Decimal("0.00"), ge=0, description="Min subtotal required")
    usage_limit: int | None = Field(default=None, ge=1, description="Total redemption limit")
    start_date: datetime | None = Field(default=None)
    end_date: datetime | None = Field(default=None)
    is_active: bool = Field(default=True)


class PromotionUpdate(BaseModel):
    """Payload to update an existing promotion."""

    name_en: str | None = Field(default=None, max_length=100)
    name_km: str | None = Field(default=None, max_length=100)
    code: str | None = Field(default=None, max_length=50)
    branch_id: UUID | None = Field(default=None)
    discount_type: DiscountType | None = None
    discount_value: Decimal | None = Field(default=None, gt=0)
    max_discount_amount_usd: Decimal | None = Field(default=None, ge=0)
    minimum_spend_usd: Decimal | None = Field(default=None, ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool | None = None


class PromotionResponse(BaseModel):
    """Complete promotion response object."""

    id: UUID
    organization_id: UUID
    business_id: UUID
    branch_id: UUID | None = None
    name_en: str
    name_km: str | None = None
    code: str | None = None
    discount_type: DiscountType
    discount_value: Decimal
    max_discount_amount_usd: Decimal | None = None
    minimum_spend_usd: Decimal
    usage_limit: int | None = None
    current_usage_count: int
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ValidatePromoRequest(BaseModel):
    """Payload to test or preview a discount on an order subtotal."""

    promo_code: str | None = Field(default=None, description="Coupon code to validate")
    manual_discount_type: DiscountType | None = Field(default=None)
    manual_discount_value: Decimal | None = Field(default=None, ge=0)
    discount_reason: DiscountReason | str | None = Field(default=None)
    subtotal_usd: Decimal = Field(..., ge=0, description="Active order subtotal")


class DiscountEvaluationResult(BaseModel):
    """Result of evaluating a promotion or manual discount."""

    is_valid: bool
    discount_usd: Decimal
    discount_percent: Decimal | None = None
    discount_reason: str | None = None
    promotion_id: UUID | None = None
    message: str | None = None
