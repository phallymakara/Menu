from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    ChangeCurrencyPreference,
    DiscountReason,
    DiscountType,
    PaymentMethod,
    PaymentStatus,
)


class CashPaymentRequest(BaseModel):
    """Payload submitted by cashier to settle a bill with cash."""

    amount_tendered_usd: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        description="Amount of USD cash tendered by customer",
    )
    amount_tendered_khr: int = Field(
        default=0,
        ge=0,
        description="Amount of KHR cash tendered by customer",
    )
    preferred_change_currency: ChangeCurrencyPreference = Field(
        default=ChangeCurrencyPreference.KHR,
        description="Change return mode: 'khr' (all in Riel), 'usd' (all in USD), or 'split' (USD whole + KHR cents)",
    )
    promo_code: str | None = Field(
        default=None,
        max_length=50,
        description="Optional coupon code (e.g. WELCOME10)",
    )
    manual_discount_type: DiscountType | None = Field(
        default=None,
        description="Optional manual discount type: 'percentage' or 'fixed_amount'",
    )
    manual_discount_value: Decimal | None = Field(
        default=None,
        ge=0,
        description="Manual discount value (e.g. 10.00 for 10% or 5.00 for $5)",
    )
    discount_reason: DiscountReason | str | None = Field(
        default=None,
        max_length=100,
        description="Reason for manual discount (e.g. 'vip_customer', 'staff_meal')",
    )
    notes: str | None = Field(
        default=None,
        max_length=500,
        description="Optional cashier/payment notes",
    )


class KHQRPaymentRequest(BaseModel):
    """Payload submitted by cashier to settle a bill with KHQR (Bakong)."""

    promo_code: str | None = Field(
        default=None,
        max_length=50,
        description="Optional coupon code (e.g. WELCOME10)",
    )
    manual_discount_type: DiscountType | None = Field(
        default=None,
        description="Optional manual discount type: 'percentage' or 'fixed_amount'",
    )
    manual_discount_value: Decimal | None = Field(
        default=None,
        ge=0,
        description="Manual discount value (e.g. 10.00 for 10% or 5.00 for $5)",
    )
    discount_reason: DiscountReason | str | None = Field(
        default=None,
        max_length=100,
        description="Reason for manual discount (e.g. 'vip_customer', 'staff_meal')",
    )
    notes: str | None = Field(
        default=None,
        max_length=500,
        description="Optional cashier notes or external transaction reference",
    )



class PaymentResponse(BaseModel):
    """Financial settlement transaction response."""

    id: UUID
    organization_id: UUID
    business_id: UUID
    branch_id: UUID
    table_session_id: UUID | None = None
    order_id: UUID | None = None
    table_number: str | None = None
    table_name: str | None = None
    payment_number: str
    payment_method: PaymentMethod
    payment_status: PaymentStatus

    bill_subtotal_usd: Decimal
    discount_usd: Decimal
    service_charge_usd: Decimal
    tax_usd: Decimal
    grand_total_usd: Decimal

    exchange_rate: Decimal
    grand_total_khr: int

    amount_tendered_usd: Decimal
    amount_tendered_khr: int
    total_tendered_usd: Decimal

    change_usd: Decimal
    change_khr: int

    promotion_id: UUID | None = None
    discount_reason: str | None = None
    received_by_user_id: UUID | None = None
    notes: str | None = None
    settled_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
