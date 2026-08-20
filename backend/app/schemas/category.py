from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CategoryBase(BaseModel):
    """Base fields for a menu category."""

    name_en: str = Field(
        ...,
        min_length=1,
        max_length=150,
        description="Category name in English (e.g. 'Khmer Traditional Dishes')",
    )
    name_km: str | None = Field(
        default=None,
        max_length=150,
        description="Category name in Khmer (e.g. 'ម្ហូបប្រពៃណីខ្មែរ')",
    )
    description_en: str | None = Field(
        default=None,
        max_length=500,
        description="Category description in English",
    )
    description_km: str | None = Field(
        default=None,
        max_length=500,
        description="Category description in Khmer",
    )
    parent_id: UUID | None = Field(
        default=None,
        description="Parent category ID for subcategories (null for top-level)",
    )
    icon: str | None = Field(
        default=None,
        max_length=100,
        description="Icon identifier or emoji (e.g. 'bowl-food', 'coffee')",
    )
    image_url: str | None = Field(
        default=None,
        max_length=500,
        description="Cover image URL for the category banner",
    )
    display_order: int = Field(
        default=0,
        ge=0,
        description="Sorting order index (lower numbers display first)",
    )
    is_active: bool = Field(
        default=True,
        description="Active visibility toggle on menus",
    )


class CategoryCreate(CategoryBase):
    """Payload schema for creating a new menu category."""

    pass


class CategoryUpdate(BaseModel):
    """Schema for updating an existing category (partial updates)."""

    name_en: str | None = Field(default=None, min_length=1, max_length=150)
    name_km: str | None = Field(default=None, max_length=150)
    description_en: str | None = Field(default=None, max_length=500)
    description_km: str | None = Field(default=None, max_length=500)
    parent_id: UUID | None = None
    icon: str | None = Field(default=None, max_length=100)
    image_url: str | None = Field(default=None, max_length=500)
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class CategoryResponse(BaseModel):
    """Response schema for a flat category representation."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    parent_id: UUID | None = None
    name_en: str
    name_km: str | None = None
    description_en: str | None = None
    description_km: str | None = None
    icon: str | None = None
    image_url: str | None = None
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CategoryTreeResponse(CategoryResponse):
    """Response schema for a nested hierarchical category tree."""

    subcategories: list[CategoryResponse] = []


class CategoryReorderItem(BaseModel):
    """Single item in category reordering payload."""

    id: UUID
    display_order: int = Field(..., ge=0)


class CategoryReorderRequest(BaseModel):
    """Payload for batch updating category sort orders."""

    items: list[CategoryReorderItem] = Field(
        ...,
        min_length=1,
        description="List of category IDs and their target sort indexes",
    )
