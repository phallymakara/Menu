from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    CourseStage,
    OrderItemStatus,
    OrderSource,
    OrderStatus,
    TableSessionStatus,
)


class BillItemModifierSummary(BaseModel):
    """Modifier add-on attached to an item line."""

    id: UUID
    modifier_option_id: UUID
    name_en: str
    name_km: str | None = None
    unit_price: Decimal
    quantity: int

    model_config = ConfigDict(from_attributes=True)


class BillItemSummary(BaseModel):
    """Detailed item line item within an order round."""

    id: UUID
    menu_item_id: UUID
    item_variant_id: UUID | None = None
    item_name_en: str
    item_name_km: str | None = None
    variant_name_en: str | None = None
    variant_name_km: str | None = None
    base_unit_price: Decimal
    unit_price: Decimal
    quantity: int
    subtotal_price: Decimal
    course_stage: CourseStage
    status: OrderItemStatus
    void_reason: str | None = None
    special_instructions: str | None = None
    modifiers: list[BillItemModifierSummary] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class BillRoundSummary(BaseModel):
    """Represents a specific ordering round placed during a dining session."""

    order_id: UUID
    order_number: str
    round_number: int
    status: OrderStatus
    order_source: OrderSource
    placed_at: datetime
    round_subtotal_usd: Decimal
    items: list[BillItemSummary] = Field(default_factory=list)


class BillConsolidatedItemSummary(BaseModel):
    """Consolidated item line combining identical items across rounds."""

    menu_item_id: UUID
    item_variant_id: UUID | None = None
    item_name_en: str
    item_name_km: str | None = None
    variant_name_en: str | None = None
    variant_name_km: str | None = None
    unit_price: Decimal
    total_quantity: int
    total_price: Decimal
    modifier_names: list[str] = Field(default_factory=list)


class BillFinancialBreakdown(BaseModel):
    """Complete financial breakdown in dual currency (USD and KHR)."""

    subtotal_usd: Decimal
    discount_usd: Decimal = Decimal("0.00")
    discount_percent: Decimal | None = None
    taxable_amount_usd: Decimal
    service_charge_percent: Decimal
    service_charge_amount_usd: Decimal
    tax_percent: Decimal
    tax_amount_usd: Decimal
    grand_total_usd: Decimal

    # Dual Currency (Cambodian Riel - KHR)
    exchange_rate: Decimal
    subtotal_khr: int
    service_charge_amount_khr: int
    tax_amount_khr: int
    grand_total_khr: int


class BillSummaryResponse(BaseModel):
    """Top-level pre-check and consolidated bill response."""

    table_session_id: UUID | None = None
    table_id: UUID | None = None
    table_number: str | None = None
    table_display_name: str | None = None
    dining_area_name: str | None = None
    guest_count: int | None = None
    session_code: str | None = None
    session_status: TableSessionStatus | None = None
    opened_at: datetime | None = None
    dining_duration_minutes: int | None = None

    order_count: int
    total_item_count: int
    rounds: list[BillRoundSummary] = Field(default_factory=list)
    consolidated_items: list[BillConsolidatedItemSummary] = Field(default_factory=list)
    financials: BillFinancialBreakdown

    model_config = ConfigDict(from_attributes=True)
