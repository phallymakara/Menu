"""Request and response DTOs for guest service requests (the service hub)."""

from datetime import datetime
from typing import Any, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import ServiceRequestStatus, ServiceRequestType
from app.models.service_request import SERVICE_REQUEST_NOTE_MAX_LENGTH


class GuestServiceRequestCreate(BaseModel):
    """Payload a guest submits to ask staff for help from their table."""

    request_type: ServiceRequestType = Field(
        ...,
        description="What the guest needs from staff",
    )
    note: str | None = Field(
        default=None,
        max_length=SERVICE_REQUEST_NOTE_MAX_LENGTH,
        description="Optional short note for staff; required for custom requests",
    )

    @field_validator("note", mode="before")
    @classmethod
    def strip_note(cls, value: Any) -> Any:
        """Trims surrounding whitespace and treats a blank note as no note."""
        if isinstance(value, str):
            return value.strip() or None
        return value

    @model_validator(mode="after")
    def require_note_for_custom_request(self) -> Self:
        """A custom request means nothing to staff without a note saying what is needed."""
        if self.request_type == ServiceRequestType.CUSTOM and not self.note:
            raise ValueError("A note is required for a custom request.")
        return self


class GuestServiceRequestResponse(BaseModel):
    """A service request as the guest who raised it sees it, without staff identities."""

    id: UUID
    table_id: UUID
    table_number: str
    request_type: ServiceRequestType
    note: str | None = None
    status: ServiceRequestStatus
    created_at: datetime
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None


class ServiceRequestResponse(BaseModel):
    """A service request as staff see it in the POS service hub."""

    id: UUID
    business_id: UUID
    branch_id: UUID
    table_id: UUID
    table_session_id: UUID
    table_number: str
    dining_area_name_en: str | None = None
    dining_area_name_km: str | None = None
    request_type: ServiceRequestType
    note: str | None = None
    status: ServiceRequestStatus
    created_at: datetime
    acknowledged_at: datetime | None = None
    acknowledged_by_user_id: UUID | None = None
    acknowledged_by_name: str | None = None
    resolved_at: datetime | None = None
    resolved_by_user_id: UUID | None = None
    resolved_by_name: str | None = None
