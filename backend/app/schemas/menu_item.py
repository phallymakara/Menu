from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.item_variant import ItemVariantResponse


class MenuItemBase(BaseModel):
    """Base fields for a menu item."""

    name_en: str = Field(
        ...,
        min_length=1,
        max_length=150,
        description="Item title in English (e.g. 'Fish Amok')",
    )
    name_km: str | None = Field(
        default=None,
        max_length=150,
        description="Item title in Khmer (e.g. 'អាម៉ុកត្រី')",
    )
    description_en: str | None = Field(
        default=None,
        max_length=500,
        description="Item description in English",
    )
    description_km: str | None = Field(
        default=None,
        max_length=500,
        description="Item description in Khmer",
    )
    category_id: UUID | None = Field(
        default=None,
        description="Assigned Category ID",
    )
    sku: str | None = Field(
        default=None,
        max_length=50,
        description="Unique stock keeping unit or item code (e.g. 'KHM-001')",
    )
    base_price: Decimal = Field(
        ...,
        ge=0,
        description="Base menu price",
    )
    currency: str = Field(
        default="USD",
        pattern=r"^(USD|KHR)$",
        description="Currency code ('USD' or 'KHR')",
    )
    image_url: str | None = Field(
        default=None,
        max_length=2048,
        description="Primary item image URL",
    )
    gallery_images: list[str] = Field(
        default_factory=list,
        description="List of additional gallery image URLs",
    )
    prep_time_minutes: int = Field(
        default=15,
        ge=0,
        le=180,
        description="Estimated kitchen preparation time in minutes",
    )
    kitchen_station: str | None = Field(
        default=None,
        max_length=50,
        description="Target kitchen station tag (e.g. 'bar', 'grill', 'wok', 'salad')",
    )
    is_vegetarian: bool = Field(default=False, description="Vegetarian indicator")
    is_vegan: bool = Field(default=False, description="Vegan indicator")
    is_halal: bool = Field(default=False, description="Halal certified indicator")
    is_gluten_free: bool = Field(default=False, description="Gluten-free indicator")
    contains_nuts: bool = Field(
        default=False, description="Contains nuts allergen flag"
    )
    contains_dairy: bool = Field(
        default=False, description="Contains dairy allergen flag"
    )
    spice_level: int = Field(
        default=0,
        ge=0,
        le=3,
        description="Spiciness level: 0 (None), 1 (Mild), 2 (Medium), 3 (Extra Spicy)",
    )
    is_featured: bool = Field(
        default=False, description="Featured on top banner / recommendations"
    )
    is_popular: bool = Field(default=False, description="Popular / Best seller badge")
    is_new: bool = Field(default=False, description="New arrival badge")
    is_active: bool = Field(
        default=True, description="Active visibility toggle on menus"
    )
    display_order: int = Field(
        default=0, ge=0, description="Sort order index within category"
    )


class MenuItemCreate(MenuItemBase):
    """Payload schema for creating a new menu item."""

    pass


class MenuItemUpdate(BaseModel):
    """Schema for updating a menu item (partial updates)."""

    name_en: str | None = Field(default=None, min_length=1, max_length=150)
    name_km: str | None = Field(default=None, max_length=150)
    description_en: str | None = Field(default=None, max_length=500)
    description_km: str | None = Field(default=None, max_length=500)
    category_id: UUID | None = None
    sku: str | None = Field(default=None, max_length=50)
    base_price: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, pattern=r"^(USD|KHR)$")
    image_url: str | None = Field(default=None, max_length=2048)
    gallery_images: list[str] | None = None
    prep_time_minutes: int | None = Field(default=None, ge=0, le=180)
    kitchen_station: str | None = Field(default=None, max_length=50)
    is_vegetarian: bool | None = None
    is_vegan: bool | None = None
    is_halal: bool | None = None
    is_gluten_free: bool | None = None
    contains_nuts: bool | None = None
    contains_dairy: bool | None = None
    spice_level: int | None = Field(default=None, ge=0, le=3)
    is_featured: bool | None = None
    is_popular: bool | None = None
    is_new: bool | None = None
    is_active: bool | None = None
    display_order: int | None = Field(default=None, ge=0)


class MenuItemResponse(BaseModel):
    """Response schema for a single menu item."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    category_id: UUID | None = None
    sku: str | None = None
    name_en: str
    name_km: str | None = None
    description_en: str | None = None
    description_km: str | None = None
    base_price: Decimal
    currency: str
    image_url: str | None = None
    gallery_images: list[str] = []
    prep_time_minutes: int
    kitchen_station: str | None = None
    is_vegetarian: bool
    is_vegan: bool
    is_halal: bool
    is_gluten_free: bool
    contains_nuts: bool
    contains_dairy: bool
    spice_level: int
    is_featured: bool
    is_popular: bool
    is_new: bool
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime
    variants: list[ItemVariantResponse] = []


class MenuItemPaginationResponse(BaseModel):
    """Paginated list of menu items."""

    items: list[MenuItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
