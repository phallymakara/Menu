from __future__ import annotations

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class BranchLocalItemCreate(BaseModel):
    """Payload to create a local branch menu item or add-on."""

    name_en: str = Field(min_length=1, max_length=150)
    name_km: str | None = Field(default=None, max_length=150)
    description_en: str | None = Field(default=None, max_length=500)
    description_km: str | None = Field(default=None, max_length=500)
    category_id: UUID | None = None
    sku: str | None = Field(default=None, max_length=50)
    base_price: Decimal = Field(ge=0)
    currency: str = Field(default="USD", max_length=3)
    image_url: str | None = None
    prep_time_minutes: int | None = Field(default=15, ge=1)
    is_active: bool = True
    display_order: int = Field(default=0, ge=0)


class BranchLocalItemUpdate(BaseModel):
    """Payload to update a local branch menu item."""

    name_en: str | None = Field(default=None, min_length=1, max_length=150)
    name_km: str | None = None
    description_en: str | None = None
    description_km: str | None = None
    category_id: UUID | None = None
    sku: str | None = None
    base_price: Decimal | None = Field(default=None, ge=0)
    currency: str | None = None
    image_url: str | None = None
    prep_time_minutes: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    display_order: int | None = None


class MasterCatalogSyncRequest(BaseModel):
    """Payload for HQ to push master catalog updates to branches."""

    target_branch_ids: list[UUID] | None = Field(
        default=None,
        description="List of target branch IDs. If None/empty, syncs to all active branches.",
    )
    sync_scope: Literal["ALL_ITEMS", "CATEGORIES_ONLY", "PRICING_ONLY"] = Field(
        default="ALL_ITEMS",
        description="Scope of sync operation",
    )
    preserve_custom_prices: bool = Field(
        default=True,
        description="If True, keeps existing branch price overrides intact; if False, resets to master prices.",
    )
    force_availability: bool = Field(
        default=False,
        description="If True, resets all 86'd out-of-stock items back to active in target branches.",
    )


class CatalogSyncResult(BaseModel):
    """Summary of catalog synchronization operation."""

    branches_affected_count: int
    items_synced_count: int
    overrides_preserved_count: int
    overrides_reset_count: int
    message: str


class BranchPriceDetail(BaseModel):
    """Price and stock status for an item at a specific branch."""

    branch_id: UUID
    branch_name: str
    effective_price_usd: Decimal
    master_price_usd: Decimal
    has_price_override: bool
    is_available: bool
    is_local_item: bool = False


class CatalogComparisonItem(BaseModel):
    """Comparison item across the network."""

    item_id: UUID
    item_name_en: str
    item_name_km: str | None = None
    category_name: str | None = None
    master_base_price_usd: Decimal | None = None
    is_global_master: bool
    origin_branch_id: UUID | None = None
    branches: list[BranchPriceDetail]


class CatalogComparisonResponse(BaseModel):
    """Multi-branch catalog comparison matrix."""

    total_master_items: int
    total_local_items: int
    items: list[CatalogComparisonItem]


class ResetBranchOverridesRequest(BaseModel):
    """Request to reset branch price and availability overrides."""

    category_id: UUID | None = Field(
        default=None,
        description="Optional category filter. If None, resets all overrides for the branch.",
    )
    reset_prices: bool = Field(default=True)
    reset_availability: bool = Field(default=False)
