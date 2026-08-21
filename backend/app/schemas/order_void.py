from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OrderItemStatus, OrderStatus, VoidReasonCode


class VoidOrderItemRequest(BaseModel):
    """Payload to void a specific order line item."""

    void_reason_code: VoidReasonCode = Field(
        ...,
        description="Standard reason code for voiding item",
    )
    void_reason: str | None = Field(
        default=None,
        max_length=255,
        description="Optional custom explanation for audit logs and kitchen reporting",
    )


class VoidOrderItemResponse(BaseModel):
    """Response returned when an order item is voided."""

    id: UUID
    order_id: UUID
    item_name_en: str
    item_name_km: str | None = None
    quantity: int
    status: OrderItemStatus
    void_reason_code: VoidReasonCode | str | None = None
    void_reason: str | None = None
    voided_by_user_id: UUID | None = None
    voided_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class CancelOrderRequest(BaseModel):
    """Payload to cancel an entire order round."""

    cancel_reason_code: VoidReasonCode = Field(
        ...,
        description="Standard reason code for cancelling order round",
    )
    cancel_reason: str | None = Field(
        default=None,
        max_length=255,
        description="Optional custom cancellation notes",
    )


class CancelOrderResponse(BaseModel):
    """Response returned when an order is cancelled."""

    order_id: UUID
    order_number: str
    status: OrderStatus
    cancel_reason_code: VoidReasonCode | str | None = None
    cancel_reason: str | None = None
    cancelled_by_user_id: UUID | None = None
    cancelled_at: datetime | None = None
    voided_item_count: int

    model_config = ConfigDict(from_attributes=True)
