from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ItemAvailabilityStatus
from app.schemas.item_variant import ItemVariantResponse
from app.schemas.modifier import ModifierGroupDetailResponse


class BranchItemOverrideBase(BaseModel):
    """Base fields for branch item override."""

    price_override: Decimal | None = Field(
        default=None,
        ge=0,
        description="Custom branch price (overrides master item price)",
    )
    availability_status: ItemAvailabilityStatus = Field(
        default=ItemAvailabilityStatus.AVAILABLE,
        description="Branch item stock and visibility status",
    )
    is_featured_override: bool | None = Field(
        default=None,
        description="Branch-specific featured banner override",
    )


class BranchItemOverrideCreate(BranchItemOverrideBase):
    """Payload for setting branch item override."""

    menu_item_id: UUID = Field(..., description="Master Menu Item ID")


class BranchItemOverrideUpdate(BaseModel):
    """Payload for partially updating branch item override."""

    price_override: Decimal | None = Field(default=None, ge=0)
    availability_status: ItemAvailabilityStatus | None = None
    is_featured_override: bool | None = None


class BranchItemOverrideResponse(BranchItemOverrideBase):
    """Response schema for branch item override."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    branch_id: UUID
    menu_item_id: UUID
    created_at: datetime
    updated_at: datetime


class BulkBranchItemOverrideRequest(BaseModel):
    """Payload for bulk updating branch stock/price overrides."""

    overrides: list[BranchItemOverrideCreate] = Field(
        ...,
        description="List of item overrides to apply to the branch",
    )


class BranchCategoryAssignmentRequest(BaseModel):
    """Payload for publishing categories to a branch."""

    category_ids: list[UUID] = Field(
        ...,
        description="Ordered list of Category IDs assigned to this branch",
    )


class BranchMenuItemDisplayResponse(BaseModel):
    """Resolved menu item with branch overrides applied (for POS & QR Digital Menu)."""

    id: UUID
    category_id: UUID | None = None
    sku: str | None = None
    name_en: str
    name_km: str | None = None
    description_en: str | None = None
    description_km: str | None = None
    master_price: Decimal
    price_override: Decimal | None = None
    effective_price: Decimal
    currency: str
    image_url: str | None = None
    gallery_images: list[str] = []
    prep_time_minutes: int = 0
    kitchen_station: str | None = None
    is_vegetarian: bool = False
    is_vegan: bool = False
    is_halal: bool = False
    is_gluten_free: bool = False
    contains_nuts: bool = False
    contains_dairy: bool = False
    spice_level: int = 0
    is_featured: bool = False
    is_popular: bool = False
    is_new: bool = False
    display_order: int = 0
    availability_status: str
    is_available: bool

    variants: list[ItemVariantResponse] = []
    modifier_groups: list[ModifierGroupDetailResponse] = []


class BranchCategoryMenuResponse(BaseModel):
    """Category with resolved branch menu items."""

    id: UUID
    name_en: str
    name_km: str | None = None
    description_en: str | None = None
    description_km: str | None = None
    icon: str | None = None
    image_url: str | None = None
    display_order: int
    items: list[BranchMenuItemDisplayResponse] = []


class BranchMenuCatalogResponse(BaseModel):
    """Complete published menu catalog for a specific branch."""

    branch_id: UUID
    branch_name_en: str
    branch_name_km: str | None = None
    currency: str
    exchange_rate: Decimal | None = None
    tax_percentage: Decimal | None = None
    is_tax_inclusive: bool | None = None
    service_charge_percentage: Decimal | None = None
    is_service_charge_inclusive: bool | None = None
    categories: list[BranchCategoryMenuResponse] = []
    total_items: int
