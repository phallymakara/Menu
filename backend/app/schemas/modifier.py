from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ModifierOptionBase(BaseModel):
    """Base fields for a modifier option (add-on item)."""

    name_en: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Option name in English (e.g. '100% Normal Sugar', 'Extra Boba')",
    )
    name_km: str | None = Field(
        default=None,
        max_length=100,
        description="Option name in Khmer (e.g. 'ស្ករ 100%', 'ថែមគុជ')",
    )
    price: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        description="Additional add-on price",
    )
    is_default: bool = Field(
        default=False,
        description="Pre-selected default option",
    )
    is_active: bool = Field(
        default=True,
        description="Active visibility toggle",
    )
    display_order: int = Field(
        default=0,
        ge=0,
        description="Display order index",
    )


class ModifierOptionCreate(ModifierOptionBase):
    """Payload for creating a modifier option."""

    pass


class ModifierOptionUpdate(BaseModel):
    """Payload for partially updating a modifier option."""

    name_en: str | None = Field(default=None, min_length=1, max_length=100)
    name_km: str | None = Field(default=None, max_length=100)
    price: Decimal | None = Field(default=None, ge=0)
    is_default: bool | None = None
    is_active: bool | None = None
    display_order: int | None = Field(default=None, ge=0)


class ModifierOptionResponse(ModifierOptionBase):
    """Response schema for a modifier option."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    group_id: UUID
    created_at: datetime
    updated_at: datetime


class ModifierGroupBase(BaseModel):
    """Base fields for a modifier group."""

    name_en: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Group name in English (e.g. 'Sugar Level', 'Extra Toppings')",
    )
    name_km: str | None = Field(
        default=None,
        max_length=100,
        description="Group name in Khmer (e.g. 'កម្រិតជាតិស្ករ', 'ថែមគ្រឿង')",
    )
    description_en: str | None = Field(
        default=None,
        max_length=255,
        description="Group description in English",
    )
    description_km: str | None = Field(
        default=None,
        max_length=255,
        description="Group description in Khmer",
    )
    min_selections: int = Field(
        default=0,
        ge=0,
        description="Minimum selections required (0 = optional, 1+ = mandatory)",
    )
    max_selections: int = Field(
        default=1,
        ge=1,
        description="Maximum selections allowed (1 = radio, >1 = multi-select)",
    )
    display_order: int = Field(
        default=0,
        ge=0,
        description="Display order index",
    )
    is_active: bool = Field(
        default=True,
        description="Active visibility toggle",
    )


class ModifierGroupCreate(ModifierGroupBase):
    """Payload for creating a modifier group."""

    pass


class ModifierGroupUpdate(BaseModel):
    """Payload for updating a modifier group."""

    name_en: str | None = Field(default=None, min_length=1, max_length=100)
    name_km: str | None = Field(default=None, max_length=100)
    description_en: str | None = Field(default=None, max_length=255)
    description_km: str | None = Field(default=None, max_length=255)
    min_selections: int | None = Field(default=None, ge=0)
    max_selections: int | None = Field(default=None, ge=1)
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ModifierGroupResponse(ModifierGroupBase):
    """Response schema for a modifier group."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    created_at: datetime
    updated_at: datetime


class ModifierGroupDetailResponse(ModifierGroupResponse):
    """Response schema for a modifier group with its nested options."""

    options: list[ModifierOptionResponse] = []


class AssignModifierGroupsRequest(BaseModel):
    """Payload for assigning modifier groups to a menu item."""

    group_ids: list[UUID] = Field(
        ...,
        description="Ordered list of ModifierGroup IDs to attach to the item",
    )
