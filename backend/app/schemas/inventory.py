from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    StockAdjustmentReason,
    StockTransferStatus,
    UnitOfMeasure,
)


class InventoryItemCreate(BaseModel):
    name_en: str = Field(..., min_length=1, max_length=150)
    name_km: str | None = Field(default=None, max_length=150)
    sku: str | None = Field(default=None, max_length=50)
    unit_of_measure: UnitOfMeasure = UnitOfMeasure.PIECE
    cost_per_unit_usd: Decimal = Field(default=Decimal("0.00"), ge=0)
    reorder_threshold: Decimal = Field(default=Decimal("0.00"), ge=0)
    ideal_stock_quantity: Decimal = Field(default=Decimal("0.00"), ge=0)
    menu_item_id: UUID | None = None
    is_active: bool = True


class InventoryItemUpdate(BaseModel):
    name_en: str | None = Field(default=None, min_length=1, max_length=150)
    name_km: str | None = None
    sku: str | None = None
    unit_of_measure: UnitOfMeasure | None = None
    cost_per_unit_usd: Decimal | None = Field(default=None, ge=0)
    reorder_threshold: Decimal | None = Field(default=None, ge=0)
    ideal_stock_quantity: Decimal | None = Field(default=None, ge=0)
    menu_item_id: UUID | None = None
    is_active: bool | None = None


class InventoryItemResponse(BaseModel):
    id: UUID
    organization_id: UUID
    business_id: UUID
    name_en: str
    name_km: str | None = None
    sku: str | None = None
    unit_of_measure: UnitOfMeasure
    cost_per_unit_usd: Decimal
    reorder_threshold: Decimal
    ideal_stock_quantity: Decimal
    menu_item_id: UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BranchStockResponse(BaseModel):
    id: UUID
    branch_id: UUID
    branch_name: str | None = None
    inventory_item_id: UUID
    item_name_en: str
    item_name_km: str | None = None
    sku: str | None = None
    unit_of_measure: UnitOfMeasure
    quantity: Decimal
    reorder_threshold: Decimal
    ideal_stock_quantity: Decimal
    is_low_stock: bool = False
    is_out_of_stock: bool = False
    cost_per_unit_usd: Decimal
    total_stock_value_usd: Decimal
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BranchStockAdjustRequest(BaseModel):
    inventory_item_id: UUID
    quantity_change: Decimal = Field(..., description="Positive to add stock, negative to reduce/waste stock")
    reason: StockAdjustmentReason = StockAdjustmentReason.STOCK_TAKE_AUDIT
    notes: str | None = Field(default=None, max_length=500)


class StockAdjustmentLogResponse(BaseModel):
    id: UUID
    branch_id: UUID
    branch_name: str | None = None
    inventory_item_id: UUID
    item_name_en: str
    quantity_change: Decimal
    previous_quantity: Decimal
    new_quantity: Decimal
    reason: StockAdjustmentReason
    notes: str | None = None
    adjusted_by_user_id: UUID
    adjusted_by_name: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StockTransferItemCreate(BaseModel):
    inventory_item_id: UUID
    requested_quantity: Decimal = Field(..., gt=0)


class StockTransferCreateRequest(BaseModel):
    source_branch_id: UUID
    destination_branch_id: UUID
    items: list[StockTransferItemCreate] = Field(..., min_length=1)
    notes: str | None = Field(default=None, max_length=500)


class StockTransferItemResponse(BaseModel):
    id: UUID
    inventory_item_id: UUID
    item_name_en: str
    unit_of_measure: UnitOfMeasure
    requested_quantity: Decimal
    shipped_quantity: Decimal
    received_quantity: Decimal

    model_config = ConfigDict(from_attributes=True)


class StockTransferResponse(BaseModel):
    id: UUID
    transfer_number: str
    source_branch_id: UUID
    source_branch_name: str
    destination_branch_id: UUID
    destination_branch_name: str
    status: StockTransferStatus
    requested_by_user_id: UUID
    requested_by_name: str
    approved_by_user_id: UUID | None = None
    approved_by_name: str | None = None
    dispatched_at: datetime | None = None
    received_at: datetime | None = None
    notes: str | None = None
    items: list[StockTransferItemResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LowStockAlertItem(BaseModel):
    branch_id: UUID
    branch_name: str
    branch_code: str
    inventory_item_id: UUID
    item_name_en: str
    sku: str | None = None
    unit_of_measure: UnitOfMeasure
    current_quantity: Decimal
    reorder_threshold: Decimal
    shortage_quantity: Decimal

    model_config = ConfigDict(from_attributes=True)


class LowStockAlertResponse(BaseModel):
    business_id: UUID
    total_low_stock_items: int
    alerts: list[LowStockAlertItem] = Field(default_factory=list)
