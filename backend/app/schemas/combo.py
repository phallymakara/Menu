from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ComboGroupItemBase(BaseModel):
    """Base fields for an item inside a combo choice group."""

    menu_item_id: UUID = Field(..., description="Target Menu Item ID")
    additional_price: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        description="Extra surcharge for selecting this item (e.g. 0.50 for +$0.50)",
    )
    is_default: bool = Field(
        default=False,
        description="Recommended default selection",
    )
    display_order: int = Field(
        default=0,
        ge=0,
        description="Display order index",
    )


class ComboGroupItemCreate(ComboGroupItemBase):
    """Payload for adding an item to a combo group."""

    pass


class ComboGroupItemResponse(ComboGroupItemBase):
    """Response schema for a combo group item."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    combo_group_id: UUID
    menu_item_name_en: str | None = None
    menu_item_name_km: str | None = None


class ComboGroupBase(BaseModel):
    """Base fields for a combo selection bucket."""

    name_en: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Choice group name in English (e.g. 'Main Dish', 'Drink')",
    )
    name_km: str | None = Field(
        default=None,
        max_length=100,
        description="Choice group name in Khmer (e.g. 'ម្ហូបចម្បង', 'ភេសជ្ជៈ')",
    )
    min_quantity: int = Field(
        default=1,
        ge=0,
        description="Minimum selections required",
    )
    max_quantity: int = Field(
        default=1,
        ge=1,
        description="Maximum selections allowed",
    )
    display_order: int = Field(
        default=0,
        ge=0,
        description="Display order index",
    )


class ComboGroupCreate(ComboGroupBase):
    """Payload for creating a combo group with items."""

    items: list[ComboGroupItemCreate] = Field(
        default_factory=list,
        description="List of eligible items for this choice group",
    )


class ComboGroupResponse(ComboGroupBase):
    """Response schema for a combo choice group."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    combo_id: UUID
    items: list[ComboGroupItemResponse] = []


class ComboBase(BaseModel):
    """Base fields for a Combo / Set Menu bundle."""

    name_en: str = Field(
        ...,
        min_length=1,
        max_length=150,
        description="Combo bundle title in English (e.g. 'Lunch Combo')",
    )
    name_km: str | None = Field(
        default=None,
        max_length=150,
        description="Combo bundle title in Khmer (e.g. 'ឈុតអាហារថ្ងៃត្រង់')",
    )
    description_en: str | None = Field(
        default=None,
        max_length=500,
        description="Combo description in English",
    )
    description_km: str | None = Field(
        default=None,
        max_length=500,
        description="Combo description in Khmer",
    )
    category_id: UUID | None = Field(
        default=None,
        description="Assigned Category ID",
    )
    sku: str | None = Field(
        default=None,
        max_length=50,
        description="Optional unique combo SKU",
    )
    pricing_type: str = Field(
        default="FIXED",
        pattern=r"^(FIXED|DISCOUNT_PERCENTAGE)$",
        description="Pricing strategy: 'FIXED' or 'DISCOUNT_PERCENTAGE'",
    )
    base_price: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        description="Fixed bundle price (when pricing_type is 'FIXED')",
    )
    discount_percentage: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        le=100,
        description="Discount % (when pricing_type is 'DISCOUNT_PERCENTAGE')",
    )
    currency: str = Field(
        default="USD",
        pattern=r"^(USD|KHR)$",
        description="Currency code ('USD' or 'KHR')",
    )
    image_url: str | None = Field(
        default=None,
        max_length=500,
        description="Combo promotional banner or image URL",
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


class ComboCreate(ComboBase):
    """Payload for creating a new combo with nested choice groups and items."""

    groups: list[ComboGroupCreate] = Field(
        default_factory=list,
        description="Choice groups and eligible items for this bundle",
    )


class ComboUpdate(BaseModel):
    """Payload for partially updating a combo bundle."""

    name_en: str | None = Field(default=None, min_length=1, max_length=150)
    name_km: str | None = Field(default=None, max_length=150)
    description_en: str | None = Field(default=None, max_length=500)
    description_km: str | None = Field(default=None, max_length=500)
    category_id: UUID | None = None
    sku: str | None = Field(default=None, max_length=50)
    pricing_type: str | None = Field(
        default=None, pattern=r"^(FIXED|DISCOUNT_PERCENTAGE)$"
    )
    base_price: Decimal | None = Field(default=None, ge=0)
    discount_percentage: Decimal | None = Field(default=None, ge=0, le=100)
    currency: str | None = Field(default=None, pattern=r"^(USD|KHR)$")
    image_url: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None
    display_order: int | None = Field(default=None, ge=0)


class ComboResponse(ComboBase):
    """Flat response schema for a combo bundle."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    created_at: datetime
    updated_at: datetime


class ComboDetailResponse(ComboResponse):
    """Detailed response schema for a combo bundle with all choice groups and items."""

    groups: list[ComboGroupResponse] = []


class ComboPaginationResponse(BaseModel):
    """Paginated list of combos."""

    items: list[ComboDetailResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
