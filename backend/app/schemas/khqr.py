from __future__ import annotations

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import DiscountReason, DiscountType


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
    qr_image_data_url: str = Field(description="Base64 Data URI for rendering <img> in HTML/React")
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
