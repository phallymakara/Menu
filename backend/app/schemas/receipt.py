from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ReceiptItem(BaseModel):
    """Line item representation on a printed receipt."""

    item_name_en: str
    item_name_km: str | None = None
    variant_name_en: str | None = None
    variant_name_km: str | None = None
    modifier_names_en: list[str] = Field(default_factory=list)
    modifier_names_km: list[str] = Field(default_factory=list)
    quantity: int
    unit_price_usd: Decimal
    total_price_usd: Decimal


class ReceiptFinancials(BaseModel):
    """Financial breakdown formatted for receipt display."""

    subtotal_usd: Decimal
    discount_usd: Decimal = Decimal("0.00")
    service_charge_percent: Decimal = Decimal("0.00")
    service_charge_amount_usd: Decimal = Decimal("0.00")
    tax_percent: Decimal = Decimal("0.00")
    tax_amount_usd: Decimal = Decimal("0.00")
    grand_total_usd: Decimal
    exchange_rate: Decimal
    grand_total_khr: int

    amount_tendered_usd: Decimal | None = None
    amount_tendered_khr: int | None = None
    total_tendered_usd: Decimal | None = None
    change_usd: Decimal | None = None
    change_khr: int | None = None


class ReceiptData(BaseModel):
    """Top-level normalized receipt payload for rendering."""

    receipt_type: Literal["OFFICIAL_RECEIPT", "PRE_CHECK_BILL"]
    receipt_number: str
    business_name_en: str
    business_name_km: str | None = None
    branch_name_en: str
    branch_name_km: str | None = None
    branch_code: str | None = None
    branch_address: str | None = None
    branch_phone: str | None = None
    table_number: str | None = None
    dining_area_name: str | None = None
    guest_count: int | None = None
    cashier_name: str | None = None
    issued_at: datetime
    payment_method: str | None = None
    items: list[ReceiptItem]
    financials: ReceiptFinancials
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)
