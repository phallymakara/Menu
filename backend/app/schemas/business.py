from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.branch import (
    BAKONG_ACCOUNT_ID_PATTERN,
    BAKONG_MERCHANT_CITY_MAX,
    BAKONG_MERCHANT_NAME_MAX,
    BranchResponse,
)


class BusinessResponse(BaseModel):
    """Response schema for a tenant business."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name_en: str
    name_km: str | None = None
    business_type: str
    logo_url: str | None = None
    phone: str | None = None
    email: str | None = None
    base_currency: str = "USD"
    exchange_rate: Decimal | None = None
    tax_percentage: Decimal | None = None
    is_tax_inclusive: bool | None = None
    service_charge_percentage: Decimal | None = None
    is_service_charge_inclusive: bool | None = None
    bakong_account_id: str | None = None
    bakong_merchant_name: str | None = None
    bakong_merchant_city: str | None = None
    bakong_acquiring_bank: str | None = None
    is_active: bool
    branches: list[BranchResponse] = []
    created_at: datetime
    updated_at: datetime


class BusinessUpdate(BaseModel):
    """Schema for updating a tenant business profile (partial updates only)."""

    name_en: str | None = Field(default=None, min_length=1, max_length=150)
    name_km: str | None = Field(default=None, max_length=150)
    business_type: str | None = Field(default=None, min_length=1, max_length=50)
    logo_url: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = Field(default=None, max_length=255)
    base_currency: str | None = Field(default=None, pattern="^(USD|KHR)$")
    exchange_rate: Decimal | None = Field(default=None, gt=0)
    tax_percentage: Decimal | None = Field(default=None, ge=0, le=100)
    is_tax_inclusive: bool | None = None
    service_charge_percentage: Decimal | None = Field(default=None, ge=0, le=100)
    is_service_charge_inclusive: bool | None = None
    bakong_account_id: str | None = Field(
        default=None,
        max_length=100,
        pattern=BAKONG_ACCOUNT_ID_PATTERN,
        description="Bakong account that receives KHQR payments, e.g. name@bank",
    )
    bakong_merchant_name: str | None = Field(
        default=None, min_length=1, max_length=BAKONG_MERCHANT_NAME_MAX
    )
    bakong_merchant_city: str | None = Field(
        default=None, min_length=1, max_length=BAKONG_MERCHANT_CITY_MAX
    )
    bakong_acquiring_bank: str | None = Field(default=None, min_length=1, max_length=50)
