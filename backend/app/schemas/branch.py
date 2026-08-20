from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TimeSlot(BaseModel):
    """Represents an open and close time range (e.g., for split shifts)."""

    open_time: str = Field(
        ...,
        description="Opening time in HH:MM format",
        pattern=r"^([01]\d|2[0-3]):([0-5]\d)$",
        examples=["08:00", "17:00"],
    )
    close_time: str = Field(
        ...,
        description="Closing time in HH:MM format",
        pattern=r"^([01]\d|2[0-3]):([0-5]\d)$",
        examples=["14:00", "22:00"],
    )


class DaySchedule(BaseModel):
    """Operating schedule for a single day of the week."""

    is_closed: bool = Field(
        default=False, description="Whether the branch is closed on this day"
    )
    slots: list[TimeSlot] = Field(
        default_factory=list,
        description="List of opening intervals for the day (supports split shifts)",
    )


class OperatingHours(BaseModel):
    """Weekly operating schedule."""

    monday: DaySchedule | None = None
    tuesday: DaySchedule | None = None
    wednesday: DaySchedule | None = None
    thursday: DaySchedule | None = None
    friday: DaySchedule | None = None
    saturday: DaySchedule | None = None
    sunday: DaySchedule | None = None


class BranchBase(BaseModel):
    """Base fields for a branch."""

    name_en: str = Field(
        ..., min_length=1, max_length=150, description="Branch English name"
    )
    name_km: str | None = Field(
        default=None, max_length=150, description="Branch Khmer name"
    )
    code: str = Field(
        ..., min_length=1, max_length=50, description="Unique branch code/identifier"
    )
    phone: str | None = Field(
        default=None, max_length=30, description="Branch contact phone"
    )
    address: str | None = Field(
        default=None, max_length=500, description="Physical address"
    )
    timezone: str = Field(
        default="Asia/Phnom_Penh", max_length=50, description="Branch time zone"
    )
    default_language: str = Field(
        default="km",
        pattern=r"^(km|en)$",
        description="Default operational language ('km' or 'en')",
    )
    base_currency: str = Field(
        default="USD",
        pattern=r"^(USD|KHR)$",
        description="Base billing currency ('USD' or 'KHR')",
    )
    exchange_rate: Decimal | None = Field(
        default=None,
        gt=0,
        description="Custom branch exchange rate (1 USD = X KHR override)",
    )
    tax_percentage: Decimal | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Custom branch tax percentage override",
    )
    is_tax_inclusive: bool | None = Field(
        default=None,
        description="Whether branch prices include tax",
    )
    service_charge_percentage: Decimal | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Custom branch service charge percentage override",
    )
    is_service_charge_inclusive: bool | None = Field(
        default=None,
        description="Whether branch prices include service charge",
    )
    operating_hours: dict[str, Any] | None = Field(
        default=None,
        description="Weekly operating schedule and split shifts",
    )
    is_active: bool = Field(
        default=True, description="Active status toggle (open / temporarily closed)"
    )


class BranchCreate(BranchBase):
    """Payload schema for creating a new branch."""

    pass


class BranchUpdate(BaseModel):
    """Schema for updating branch profile and operational settings (partial update)."""

    name_en: str | None = Field(default=None, min_length=1, max_length=150)
    name_km: str | None = Field(default=None, max_length=150)
    code: str | None = Field(default=None, min_length=1, max_length=50)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)
    timezone: str | None = Field(default=None, max_length=50)
    default_language: str | None = Field(default=None, pattern=r"^(km|en)$")
    base_currency: str | None = Field(default=None, pattern=r"^(USD|KHR)$")
    exchange_rate: Decimal | None = Field(default=None, gt=0)
    tax_percentage: Decimal | None = Field(default=None, ge=0, le=100)
    is_tax_inclusive: bool | None = None
    service_charge_percentage: Decimal | None = Field(default=None, ge=0, le=100)
    is_service_charge_inclusive: bool | None = None
    operating_hours: dict[str, Any] | None = Field(default=None)
    is_active: bool | None = Field(default=None)


class BranchResponse(BaseModel):
    """Response schema for a branch."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    business_id: UUID
    name_en: str
    name_km: str | None = None
    code: str
    phone: str | None = None
    address: str | None = None
    timezone: str
    default_language: str
    base_currency: str
    exchange_rate: Decimal | None = None
    tax_percentage: Decimal | None = None
    is_tax_inclusive: bool | None = None
    service_charge_percentage: Decimal | None = None
    is_service_charge_inclusive: bool | None = None
    operating_hours: dict[str, Any] | list[Any] | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
