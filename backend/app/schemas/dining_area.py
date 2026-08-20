from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DiningAreaBase(BaseModel):
    """Base fields for a dining area / spatial zone."""

    name_en: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Zone name in English (e.g. 'Main Dining Hall', 'VIP Room 1')",
    )
    name_km: str | None = Field(
        default=None,
        max_length=100,
        description="Zone name in Khmer (e.g. 'បន្ទប់ VIP 1', 'រានហាលក្រៅ')",
    )
    description_en: str | None = Field(
        default=None,
        max_length=255,
        description="Zone description in English",
    )
    description_km: str | None = Field(
        default=None,
        max_length=255,
        description="Zone description in Khmer",
    )
    service_charge_percentage: Decimal | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Optional custom service charge % for this zone",
    )
    minimum_spend: Decimal | None = Field(
        default=None,
        ge=0,
        description="Optional minimum spend required (e.g. $50 for VIP Private Room)",
    )
    display_order: int = Field(
        default=0,
        ge=0,
        description="Display order index for floor map sorting",
    )
    is_active: bool = Field(
        default=True,
        description="Active visibility toggle",
    )


class DiningAreaCreate(DiningAreaBase):
    """Payload for creating a dining area."""

    pass


class DiningAreaUpdate(BaseModel):
    """Payload for partially updating a dining area."""

    name_en: str | None = Field(default=None, min_length=1, max_length=100)
    name_km: str | None = Field(default=None, max_length=100)
    description_en: str | None = Field(default=None, max_length=255)
    description_km: str | None = Field(default=None, max_length=255)
    service_charge_percentage: Decimal | None = Field(default=None, ge=0, le=100)
    minimum_spend: Decimal | None = Field(default=None, ge=0)
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class DiningAreaResponse(DiningAreaBase):
    """Response schema for a dining area."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    branch_id: UUID
    created_at: datetime
    updated_at: datetime


class DiningAreaReorderRequest(BaseModel):
    """Payload for batch reordering dining areas."""

    area_ids: list[UUID] = Field(
        ...,
        description="Ordered list of DiningArea IDs for floor map layout",
    )
