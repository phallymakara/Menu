from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.branch import BranchResponse


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
    exchange_rate: Decimal = Decimal("4100.00")
    tax_percentage: Decimal = Decimal("0.00")
    is_tax_inclusive: bool = True
    service_charge_percentage: Decimal = Decimal("0.00")
    is_service_charge_inclusive: bool = False
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
