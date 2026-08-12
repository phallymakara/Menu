from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class BranchResponse(BaseModel):
    """Response schema for a tenant branch."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    name_en: str
    name_km: str | None = None
    code: str
    phone: str | None = None
    address: str | None = None
    timezone: str
    default_language: str
    base_currency: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


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
