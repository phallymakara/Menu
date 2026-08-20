from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BillingCycle, SubscriptionStatus


class PlanResponse(BaseModel):
    """Response schema for a subscription plan tier."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str
    description: str | None = None
    price_usd_monthly: Decimal
    price_usd_annually: Decimal
    max_branches: int
    max_staff: int
    feature_flags: dict[str, Any]
    is_active: bool
    is_public: bool


class SubscriptionResponse(BaseModel):
    """Response schema for an organization's subscription status and usage."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    plan: PlanResponse
    status: SubscriptionStatus
    billing_cycle: BillingCycle
    trial_starts_at: datetime | None = None
    trial_ends_at: datetime | None = None
    days_remaining_in_trial: int | None = None
    current_period_starts_at: datetime
    current_period_ends_at: datetime
    cancelled_at: datetime | None = None
    current_branch_count: int
    current_staff_count: int


class ChangePlanRequest(BaseModel):
    """Payload to upgrade, downgrade, or change subscription tier."""

    plan_code: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Target plan code (e.g. 'starter', 'standard', 'growth')",
    )
    billing_cycle: BillingCycle = Field(
        default=BillingCycle.MONTHLY,
        description="Billing cycle ('monthly' or 'annual')",
    )
