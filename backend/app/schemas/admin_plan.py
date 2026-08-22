from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AdminPlanListItem(BaseModel):
    """Subscription plan item for Super Admin list view."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Plan unique identifier")
    code: str = Field(..., description="Unique plan code")
    name: str = Field(..., description="Plan display name")
    description: str | None = Field(None, description="Plan description")
    price_usd_monthly: Decimal = Field(..., description="Monthly subscription price in USD")
    price_usd_annually: Decimal = Field(..., description="Annual subscription price in USD")
    max_branches: int = Field(..., description="Maximum branch outlets allowed")
    max_staff: int = Field(..., description="Maximum staff members allowed")
    feature_flags: dict[str, Any] = Field(default_factory=dict, description="Feature gates and limit toggles")
    is_active: bool = Field(True, description="Whether plan is active")
    is_public: bool = Field(True, description="Whether plan is visible on public pricing")
    active_subscribers_count: int = Field(0, description="Total active organization subscribers")
    created_at: datetime = Field(..., description="Plan creation timestamp")
    updated_at: datetime = Field(..., description="Plan last update timestamp")


class AdminPlanSubscriberItem(BaseModel):
    """Organization subscriber details under a plan."""

    model_config = ConfigDict(from_attributes=True)

    organization_id: UUID
    organization_name: str
    organization_slug: str
    organization_status: str
    subscription_status: str
    billing_cycle: str
    trial_ends_at: datetime | None = None
    current_period_ends_at: datetime
    created_at: datetime


class AdminPlanDetail(BaseModel):
    """Detailed plan profile including active subscribers list."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    description: str | None = None
    price_usd_monthly: Decimal
    price_usd_annually: Decimal
    max_branches: int
    max_staff: int
    feature_flags: dict[str, Any] = Field(default_factory=dict)
    is_active: bool
    is_public: bool
    subscribers: list[AdminPlanSubscriberItem] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class AdminPlanCreateRequest(BaseModel):
    """Request payload for creating a new subscription plan."""

    code: str = Field(..., min_length=2, max_length=50, description="Unique plan code (e.g. growth_tier)")
    name: str = Field(..., min_length=2, max_length=100, description="Plan name (e.g. Growth Multi-Branch)")
    description: str | None = Field(None, max_length=255, description="Plan description")
    price_usd_monthly: Decimal = Field(default=Decimal("0.00"), ge=0, description="Monthly price in USD")
    price_usd_annually: Decimal = Field(default=Decimal("0.00"), ge=0, description="Annual price in USD")
    max_branches: int = Field(default=1, ge=-1, description="Max branches (-1 for unlimited)")
    max_staff: int = Field(default=5, ge=-1, description="Max staff (-1 for unlimited)")
    feature_flags: dict[str, Any] = Field(default_factory=dict, description="Feature gates e.g. has_kds, has_inventory")
    is_active: bool = Field(default=True, description="Whether plan is active")
    is_public: bool = Field(default=True, description="Whether plan is publicly selectable")


class AdminPlanUpdateRequest(BaseModel):
    """Request payload for updating an existing subscription plan."""

    name: str | None = Field(None, min_length=2, max_length=100)
    description: str | None = Field(None, max_length=255)
    price_usd_monthly: Decimal | None = Field(None, ge=0)
    price_usd_annually: Decimal | None = Field(None, ge=0)
    max_branches: int | None = Field(None, ge=-1)
    max_staff: int | None = Field(None, ge=-1)
    feature_flags: dict[str, Any] | None = None
    is_active: bool | None = None
    is_public: bool | None = None
