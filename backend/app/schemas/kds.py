from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import CourseStage, OrderItemStatus, OrderType
from app.schemas.order import OrderItemModifierResponse


class KDSTicketItemResponse(BaseModel):
    id: UUID
    menu_item_id: UUID
    item_name_en: str
    item_name_km: str | None = None
    variant_name_en: str | None = None
    variant_name_km: str | None = None
    quantity: int
    course_stage: CourseStage
    status: OrderItemStatus
    special_instructions: str | None = None
    void_reason: str | None = None
    kitchen_station_id: UUID | None = None
    station_name: str | None = None
    station_code: str | None = None
    station_color_hex: str | None = None
    modifiers: list[OrderItemModifierResponse] = Field(default_factory=list)
    fired_at: datetime | None = None
    cooking_started_at: datetime | None = None
    ready_at: datetime | None = None
    served_at: datetime | None = None
    elapsed_minutes: int = 0

    model_config = ConfigDict(from_attributes=True)


class KDSTicketResponse(BaseModel):
    order_id: UUID
    order_number: str
    order_type: OrderType
    round_number: int
    table_id: UUID | None = None
    table_number: str | None = None
    table_session_id: UUID | None = None
    session_code: str | None = None
    guest_notes: str | None = None
    created_at: datetime
    elapsed_minutes: int
    has_held_items: bool
    items: list[KDSTicketItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ItemStatusBumpRequest(BaseModel):
    target_status: OrderItemStatus
    void_reason: str | None = Field(default=None, max_length=255)


class CourseFireRequest(BaseModel):
    course_stage: CourseStage | None = None
    order_item_ids: list[UUID] = Field(default_factory=list)


class ItemRerouteRequest(BaseModel):
    target_kitchen_station_id: UUID
