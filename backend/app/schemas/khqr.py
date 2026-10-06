from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import DiscountReason, DiscountType, KHQRPaymentAttemptStatus


class DynamicKHQRRequest(BaseModel):
    """Payload to request dynamic KHQR code for bill payment."""

    currency: Literal["USD", "KHR"] = Field(
        default="USD",
        description="Currency for dynamic KHQR (USD: 840 or KHR: 116)",
    )
    promo_code: str | None = Field(
        default=None,
        max_length=50,
        description="Optional coupon code (e.g. WELCOME10)",
    )
    manual_discount_type: DiscountType | None = Field(default=None)
    manual_discount_value: Decimal | None = Field(default=None, ge=0)
    discount_reason: DiscountReason | str | None = Field(default=None)


class KHQRResponse(BaseModel):
    """Complete KHQR generation payload with EMVCo string and Base64 QR image."""

    qr_string: str = Field(description="Standard EMVCo Tag-Length-Value payload string")
    qr_image_data_url: str = Field(
        description="Base64 Data URI for rendering <img> in HTML/React"
    )
    currency: Literal["USD", "KHR"]
    amount: Decimal = Field(description="Payable amount in selected currency")
    amount_usd: Decimal
    amount_khr: int
    exchange_rate: Decimal
    merchant_name: str
    merchant_city: str
    bakong_account_id: str
    bill_reference: str
    deep_link_url: str = Field(description="Native app deep-link: bakong://qr?data=...")


class DynamicKHQRResponse(KHQRResponse):
    """Dynamic KHQR together with the payment attempt that tracks it."""

    attempt_id: UUID = Field(
        description="Payment attempt to poll and to pass when settling the bill"
    )
    md5: str = Field(
        description="MD5 of qr_string, the key Bakong uses to look up the payment"
    )
    expires_at: datetime = Field(
        description="After this time banking apps refuse to pay the KHQR"
    )
    status: KHQRPaymentAttemptStatus


class KHQRPaymentAttemptResponse(BaseModel):
    """Current state of a KHQR payment attempt."""

    attempt_id: UUID
    status: KHQRPaymentAttemptStatus
    table_session_id: UUID | None = None
    order_id: UUID | None = None
    amount: Decimal
    currency: Literal["USD", "KHR"]
    md5: str
    expires_at: datetime
    verified_at: datetime | None = None
    bakong_reference: str | None = Field(
        default=None, description="Bakong transaction hash once the payment is seen"
    )
    failure_reason: str | None = None
    payment_id: UUID | None = Field(
        default=None, description="Payment created from this attempt, once settled"
    )
    created_at: datetime
    verification_available: bool = Field(
        description=(
            "False when the server has no Bakong API token, so the payment can "
            "only be confirmed manually by an owner or manager"
        )
    )
