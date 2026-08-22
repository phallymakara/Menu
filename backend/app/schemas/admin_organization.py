from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OrganizationStatus, SubscriptionStatus


class AdminOrganizationListItem(BaseModel):
    """Summarized organization item for Super Admin directory listing."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Organization unique identifier")
    name: str = Field(..., description="Organization name")
    slug: str = Field(..., description="Organization URL slug")
    status: OrganizationStatus = Field(..., description="Organization active status")
    is_active: bool = Field(..., description="Whether the organization is active")

    owner_id: UUID | None = Field(None, description="Owner user ID")
    owner_name: str | None = Field(None, description="Owner full name")
    owner_email: str | None = Field(None, description="Owner email address")
    owner_phone: str | None = Field(None, description="Owner phone number")

    businesses_count: int = Field(0, description="Total restaurant brands under this organization")
    branches_count: int = Field(0, description="Total physical branch outlets under this organization")
    tables_count: int = Field(0, description="Total restaurant tables configured")
    staff_count: int = Field(0, description="Total staff members in this organization")

    plan_id: UUID | None = Field(None, description="Current subscription plan ID")
    plan_code: str | None = Field(None, description="Subscription plan code")
    plan_name: str | None = Field(None, description="Subscription plan name")
    subscription_status: SubscriptionStatus | None = Field(None, description="Subscription lifecycle status")

    created_at: datetime = Field(..., description="Timestamp when organization was created")
    updated_at: datetime = Field(..., description="Timestamp when organization was last updated")


class AdminOrganizationListResponse(BaseModel):
    """Paginated list response for Super Admin organization directory."""

    model_config = ConfigDict(from_attributes=True)

    items: list[AdminOrganizationListItem] = Field(..., description="List of organizations")
    total: int = Field(..., description="Total matching organizations")
    page: int = Field(1, description="Current page number")
    page_size: int = Field(20, description="Number of items per page")
    total_pages: int = Field(1, description="Total available pages")


class AdminBusinessBrief(BaseModel):
    """Brief business representation for organization detail view."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name_en: str
    name_km: str | None = None
    business_type: str
    base_currency: str
    branches_count: int = 0
    is_active: bool


class AdminBranchBrief(BaseModel):
    """Brief branch representation for organization detail view."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_id: UUID
    business_name: str
    name_en: str
    name_km: str | None = None
    code: str
    phone: str | None = None
    address: str | None = None
    bakong_account_id: str | None = None
    tables_count: int = 0
    is_active: bool


class AdminSubscriptionBrief(BaseModel):
    """Subscription detail for organization deep inspection."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plan_id: UUID
    plan_code: str
    plan_name: str
    price_usd_monthly: float
    status: SubscriptionStatus
    billing_cycle: str
    trial_starts_at: datetime | None = None
    trial_ends_at: datetime | None = None
    current_period_starts_at: datetime
    current_period_ends_at: datetime
    cancelled_at: datetime | None = None


class AdminUserBrief(BaseModel):
    """Owner / staff user representation for organization inspection."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    status: str
    created_at: datetime


class AdminOrganizationDetail(BaseModel):
    """Comprehensive organization detail for Super Admin inspection."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    status: OrganizationStatus
    is_active: bool
    owner: AdminUserBrief | None = None
    businesses: list[AdminBusinessBrief] = Field(default_factory=list)
    branches: list[AdminBranchBrief] = Field(default_factory=list)
    tables_count: int = 0
    staff_count: int = 0
    subscription: AdminSubscriptionBrief | None = None
    created_at: datetime
    updated_at: datetime


class AdminOrganizationStatusUpdate(BaseModel):
    """Request payload for updating organization status."""

    status: OrganizationStatus = Field(..., description="Target status: active, suspended, or archived")
    reason: str | None = Field(None, description="Reason for suspension or status change")


class AdminOrganizationSubscriptionOverride(BaseModel):
    """Request payload for manually overriding an organization's subscription."""

    plan_id: UUID = Field(..., description="Target plan ID to assign")
    status: SubscriptionStatus | None = Field(None, description="Optional target subscription status")
    trial_ends_at: datetime | None = Field(None, description="Optional custom trial end date")
    current_period_ends_at: datetime | None = Field(None, description="Optional custom billing period end date")
    notes: str | None = Field(None, description="Administrative notes for this override")
