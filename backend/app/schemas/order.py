from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    CourseStage,
    OrderItemStatus,
    OrderSource,
    OrderStatus,
    OrderType,
)


class OrderItemModifierCreate(BaseModel):
    modifier_option_id: UUID
    quantity: int = Field(default=1, ge=1, le=10)


class OrderItemCreate(BaseModel):
    menu_item_id: UUID
    item_variant_id: UUID | None = None
    quantity: int = Field(default=1, ge=1, le=100)
    modifiers: list[OrderItemModifierCreate] = Field(default_factory=list)
    course_stage: CourseStage = Field(default=CourseStage.MAINS)
    special_instructions: str | None = Field(default=None, max_length=255)


class GuestOrderPlacementRequest(BaseModel):
    guest_notes: str | None = Field(default=None, max_length=500)
    items: list[OrderItemCreate] = Field(..., min_length=1)


class StaffOrderPlacementRequest(BaseModel):
    table_id: UUID | None = None
    table_session_id: UUID | None = None
    order_type: OrderType = Field(default=OrderType.DINE_IN)
    guest_notes: str | None = Field(default=None, max_length=500)
    items: list[OrderItemCreate] = Field(..., min_length=1)


class OrderItemModifierResponse(BaseModel):
    id: UUID
    modifier_option_id: UUID
    name_en: str
    name_km: str | None = None
    unit_price: Decimal
    quantity: int

    model_config = ConfigDict(from_attributes=True)


class OrderItemResponse(BaseModel):
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
    special_instructions: str | None = None
    status: OrderItemStatus
    void_reason: str | None = None
    modifiers: list[OrderItemModifierResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    id: UUID
    organization_id: UUID
    business_id: UUID
    branch_id: UUID
    table_id: UUID | None = None
    table_session_id: UUID | None = None
    order_number: str
    order_type: OrderType
    order_source: OrderSource
    round_number: int
    status: OrderStatus
    subtotal_usd: Decimal
    subtotal_khr: Decimal
    tax_rate_percent: Decimal
    tax_amount_usd: Decimal
    service_charge_percent: Decimal
    service_charge_amount_usd: Decimal
    total_amount_usd: Decimal
    total_amount_khr: Decimal
    guest_notes: str | None = None
    placed_by_user_id: UUID | None = None
    items: list[OrderItemResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TableSessionOrdersSummaryResponse(BaseModel):
    table_session_id: UUID
    table_id: UUID
    table_number: str
    status: str
    total_rounds: int
    total_items_count: int
    subtotal_usd: Decimal
    subtotal_khr: Decimal
    tax_amount_usd: Decimal
    service_charge_amount_usd: Decimal
    grand_total_usd: Decimal
    grand_total_khr: Decimal
    orders: list[OrderResponse] = Field(default_factory=list)
