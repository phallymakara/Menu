from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ItemVariantBase(BaseModel):
    """Base fields for an item variant (size, temperature, portion)."""

    variant_group: str = Field(
        default="Size",
        max_length=50,
        description="Option group label (e.g. 'Size', 'Temperature', 'Portion')",
    )
    name_en: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Variant option name in English (e.g. 'Large', 'Iced')",
    )
    name_km: str | None = Field(
        default=None,
        max_length=100,
        description="Variant option name in Khmer (e.g. 'ធំ', 'ទឹកកក')",
    )
    sku: str | None = Field(
        default=None,
        max_length=50,
        description="Optional SKU specific to this variant",
    )
    price_adjustment: Decimal = Field(
        default=Decimal("0.00"),
        description="Price delta relative to base item price (e.g. 0.75 for +$0.75)",
    )
    is_default: bool = Field(
        default=False,
        description="Default selected variant for this group",
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


class ItemVariantCreate(ItemVariantBase):
    """Payload schema for creating a single variant."""

    pass


class ItemVariantBatchCreate(BaseModel):
    """Payload schema for creating multiple variants in batch."""

    variants: list[ItemVariantCreate] = Field(
        ...,
        min_length=1,
        description="List of variants to create for the menu item",
    )


class ItemVariantUpdate(BaseModel):
    """Schema for updating a variant (partial updates)."""

    variant_group: str | None = Field(default=None, max_length=50)
    name_en: str | None = Field(default=None, min_length=1, max_length=100)
    name_km: str | None = Field(default=None, max_length=100)
    sku: str | None = Field(default=None, max_length=50)
    price_adjustment: Decimal | None = None
    is_default: bool | None = None
    is_active: bool | None = None
    display_order: int | None = Field(default=None, ge=0)


class ItemVariantResponse(BaseModel):
    """Response schema for an item variant."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    menu_item_id: UUID
    variant_group: str
    name_en: str
    name_km: str | None = None
    sku: str | None = None
    price_adjustment: Decimal
    is_default: bool
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime
