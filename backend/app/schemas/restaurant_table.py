from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TableShape, TableStatus


class RestaurantTableBase(BaseModel):
    """Base fields for a restaurant table."""

    table_number: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Table identifier (e.g. 'T-01', 'Table 12', 'VIP-A')",
    )
    name: str | None = Field(
        default=None,
        max_length=100,
        description="Optional friendly table name (e.g. 'Window Booth 1')",
    )
    dining_area_id: UUID | None = Field(
        default=None,
        description="Assigned Dining Area ID",
    )
    min_capacity: int = Field(
        default=1,
        ge=1,
        description="Minimum seating capacity",
    )
    max_capacity: int = Field(
        default=4,
        ge=1,
        description="Maximum seating capacity",
    )
    shape: TableShape = Field(
        default=TableShape.SQUARE,
        description="Physical table shape",
    )
    status: TableStatus = Field(
        default=TableStatus.AVAILABLE,
        description="Live table operational status",
    )
    display_order: int = Field(
        default=0,
        ge=0,
        description="Display order index for floor map sorting",
    )
    is_active: bool = Field(
        default=True,
        description="Active visibility toggle",
    )


class RestaurantTableCreate(RestaurantTableBase):
    """Payload for creating a single table."""

    pass


class RestaurantTableUpdate(BaseModel):
    """Payload for partially updating table configuration."""

    table_number: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, max_length=100)
    dining_area_id: UUID | None = None
    min_capacity: int | None = Field(default=None, ge=1)
    max_capacity: int | None = Field(default=None, ge=1)
    shape: TableShape | None = None
    status: TableStatus | None = None
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class RestaurantTableStatusUpdate(BaseModel):
    """Payload for fast table status transition."""

    status: TableStatus = Field(
        ...,
        description="New table status (e.g. 'available', 'occupied')",
    )


class RestaurantTableResponse(RestaurantTableBase):
    """Response schema for a restaurant table."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    branch_id: UUID
    qr_code_token: str | None = None
    dining_area_name_en: str | None = None
    dining_area_name_km: str | None = None
    created_at: datetime
    updated_at: datetime


class RestaurantTableBatchCreate(BaseModel):
    """Payload for generating a batch range of tables."""

    prefix: str = Field(
        default="T-",
        max_length=20,
        description="Prefix for table numbers (e.g. 'T-', 'VIP-')",
    )
    start_number: int = Field(
        default=1,
        ge=1,
        description="Starting table number (e.g. 1)",
    )
    end_number: int = Field(
        default=10,
        ge=1,
        description="Ending table number (e.g. 20)",
    )
    dining_area_id: UUID | None = Field(
        default=None,
        description="Target Dining Area ID",
    )
    min_capacity: int = Field(
        default=2,
        ge=1,
        description="Minimum seating capacity",
    )
    max_capacity: int = Field(
        default=4,
        ge=1,
        description="Maximum seating capacity",
    )
    shape: TableShape = Field(
        default=TableShape.SQUARE,
        description="Physical table shape",
    )
    digits: int = Field(
        default=2,
        ge=1,
        le=5,
        description="Number of zero-padding digits (e.g. 2 -> 'T-01')",
    )


class TableQRDetailResponse(BaseModel):
    """Detailed QR response for a single table."""

    table_id: UUID
    table_number: str
    name: str | None = None
    dining_area_name_en: str | None = None
    dining_area_name_km: str | None = None
    branch_id: UUID
    branch_name_en: str
    qr_token: str
    ordering_url: str
    qr_base64: str = Field(
        ...,
        description="Base64 encoded PNG data URI ('data:image/png;base64,...')",
    )


class TablePublicVerifyResponse(BaseModel):
    """Public verification response when guest scans table QR code."""

    is_valid: bool
    table_id: UUID
    table_number: str
    table_name: str | None = None
    status: TableStatus
    dining_area_name_en: str | None = None
    dining_area_name_km: str | None = None
    branch_id: UUID
    branch_name_en: str
    business_id: UUID
    business_name_en: str
    currency: str = "USD"
    ordering_url: str


class TableBatchQRExportResponse(BaseModel):
    """Batch list response of table QR codes."""

    branch_id: UUID
    branch_name_en: str
    total_count: int
    tables: list[TableQRDetailResponse]
