from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TableSessionStatus, TableShape, TableStatus


class TableSessionOpenRequest(BaseModel):
    """Payload for opening or starting a table dining session."""

    guest_count: int = Field(
        default=1,
        ge=1,
        le=100,
        description="Number of seated guests",
    )
    notes: str | None = Field(
        default=None,
        max_length=255,
        description="Special seating notes or party tags",
    )


class TableSessionCloseRequest(BaseModel):
    """Payload for closing a table dining session."""

    next_table_status: TableStatus = Field(
        default=TableStatus.DIRTY_CLEANING,
        description="Next table operational status (default 'dirty_cleaning')",
    )
    notes: str | None = Field(
        default=None,
        max_length=255,
        description="Closing remarks or checkout notes",
    )


class TableTransferRequest(BaseModel):
    """Payload for moving an active session from one table to another."""

    target_table_id: UUID = Field(
        ...,
        description="Target table ID to transfer the party and session to",
    )
    reason: str | None = Field(
        default=None,
        max_length=255,
        description="Reason for table transfer (e.g. 'Guest requested outdoor patio')",
    )
    auto_clean_source: bool = Field(
        default=True,
        description="Mark source table as 'dirty_cleaning'",
    )


class TableMergeRequest(BaseModel):
    """Payload for merging secondary tables into a primary table."""

    secondary_table_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="List of secondary table IDs to merge into this primary table",
    )
    notes: str | None = Field(
        default=None,
        max_length=255,
        description="Notes for merged table group (e.g. 'Joined for Birthday Party')",
    )


class TableUnmergeRequest(BaseModel):
    """Payload for detaching secondary tables from a merged table group."""

    secondary_table_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="List of secondary table IDs to detach from the group",
    )


class TableSessionResponse(BaseModel):
    """Response schema for a dining table session."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_code: str
    organization_id: UUID
    business_id: UUID
    branch_id: UUID
    table_id: UUID
    table_number: str
    guest_count: int
    status: TableSessionStatus
    opened_by_type: str
    opened_at: datetime
    bill_requested_at: datetime | None = None
    closed_at: datetime | None = None
    duration_minutes: int = 0
    notes: str | None = None
    session_token: str | None = None
    parent_session_id: UUID | None = None
    merged_table_ids: list[UUID] = []
    merged_table_numbers: list[str] = []
    created_at: datetime


class DashboardTableItem(BaseModel):
    """Real-time table item for floor dashboard."""

    table_id: UUID
    table_number: str
    name: str | None = None
    shape: TableShape
    status: TableStatus
    min_capacity: int
    max_capacity: int
    dining_area_id: UUID | None = None
    dining_area_name_en: str | None = None
    active_session_id: UUID | None = None
    active_session_code: str | None = None
    active_session_status: TableSessionStatus | None = None
    guest_count: int | None = None
    session_opened_at: datetime | None = None
    duration_minutes: int | None = None


class DashboardAreaGroup(BaseModel):
    """Dining area floor map group."""

    area_id: UUID | None = None
    area_name_en: str
    area_name_km: str | None = None
    tables: list[DashboardTableItem]


class BranchTableLiveDashboardResponse(BaseModel):
    """Live real-time table floor dashboard response."""

    branch_id: UUID
    branch_name_en: str
    total_tables: int
    available_count: int
    occupied_count: int
    bill_requested_count: int
    reserved_count: int
    cleaning_count: int
    out_of_service_count: int
    areas: list[DashboardAreaGroup]
