from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class OrganizationOverviewCounters(BaseModel):
    """Platform-wide organization tenant status counters."""

    model_config = ConfigDict(from_attributes=True)

    total_organizations: int = Field(
        ..., description="Total organizations registered on the platform"
    )
    active_organizations: int = Field(..., description="Active organizations")
    trial_organizations: int = Field(
        ..., description="Organizations currently on a trial plan"
    )
    suspended_organizations: int = Field(..., description="Suspended organizations")
    archived_organizations: int = Field(
        ..., description="Archived/deactivated organizations"
    )


class PlatformEntityCounters(BaseModel):
    """Platform-wide infrastructure scale counters."""

    model_config = ConfigDict(from_attributes=True)

    total_businesses: int = Field(..., description="Total restaurant brands/businesses")
    total_branches: int = Field(..., description="Total physical branch outlets")
    total_active_branches: int = Field(..., description="Total active branch outlets")
    total_registered_users: int = Field(
        ..., description="Total registered platform user accounts"
    )
    total_staff_memberships: int = Field(
        ..., description="Total staff memberships across all tenants"
    )


class SubscriptionTierMetric(BaseModel):
    """Organization distribution per subscription plan tier."""

    model_config = ConfigDict(from_attributes=True)

    plan_code: str = Field(
        ..., description="Unique plan code, e.g. free, pro, enterprise"
    )
    plan_name: str = Field(..., description="Display name of the subscription plan")
    price_monthly_usd: Decimal = Field(
        ..., description="Monthly subscription price in USD"
    )
    organization_count: int = Field(
        ..., description="Number of organizations on this plan"
    )
    percentage_of_total: float = Field(
        ..., description="Percentage of total organizations"
    )


class PlatformSaaSEconomics(BaseModel):
    """SaaS platform-level subscription economics and tenant growth."""

    model_config = ConfigDict(from_attributes=True)

    estimated_mrr_usd: Decimal = Field(
        ..., description="Estimated Monthly Recurring Revenue from subscriptions (USD)"
    )
    estimated_arr_usd: Decimal = Field(
        ..., description="Estimated Annualized Run Rate from subscriptions (USD)"
    )
    new_tenants_last_30d: int = Field(
        ..., description="New organizations registered in the last 30 days"
    )
    tenant_growth_percentage_30d: float = Field(
        ..., description="30-day tenant signup growth rate"
    )
    active_tenant_churn_rate: float = Field(
        ..., description="Tenant churn percentage based on cancellations"
    )
    total_gmv_usd: Decimal = Field(
        default=Decimal("0.00"),
        description="Total Gross Merchandise Value processed across all platform stores in USD",
    )
    total_orders_count: int = Field(
        default=0, description="Total processed orders across all stores"
    )
    trials_expiring_soon_count: int = Field(
        default=0,
        description="Organizations with trial ending in the next 7 days",
    )


class MonthlyGrowthMetric(BaseModel):
    """Monthly revenue and tenant growth historical data point."""

    model_config = ConfigDict(from_attributes=True)

    month_key: str = Field(..., description="Month key in YYYY-MM format")
    month_label: str = Field(..., description="Display label, e.g. May 2026")
    revenue_usd: Decimal = Field(..., description="Estimated revenue in USD")
    new_tenants: int = Field(..., description="New organizations registered that month")
    cumulative_tenants: int = Field(
        ..., description="Cumulative total organizations up to that month"
    )


class ExpiringTrialOrg(BaseModel):
    """Summary of a tenant organization whose trial subscription ends soon."""

    model_config = ConfigDict(from_attributes=True)

    organization_id: str = Field(..., description="Organization UUID")
    organization_name: str = Field(..., description="Organization display name")
    organization_slug: str = Field(..., description="Organization URL slug")
    plan_name: str = Field(..., description="Subscribed plan tier name")
    trial_ends_at: datetime = Field(..., description="Trial expiration timestamp")
    days_remaining: int = Field(
        ..., description="Days remaining until trial expiration"
    )


class RecentAuditFeedItem(BaseModel):
    """Mini-summary of recent administrative audit event."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Audit log UUID")
    action: str = Field(..., description="Action performed")
    resource_type: str | None = Field(default=None, description="Resource type")
    resource_id: str | None = Field(default=None, description="Resource ID")
    actor_name: str | None = Field(
        default=None, description="Name of user who performed action"
    )
    actor_email: str | None = Field(
        default=None, description="Email of user who performed action"
    )
    organization_name: str | None = Field(
        default=None, description="Affected organization name if applicable"
    )
    created_at: datetime = Field(..., description="Timestamp of the event")


class PlatformKPIResponse(BaseModel):
    """Consolidated Super Admin Platform KPI Dashboard response payload."""

    model_config = ConfigDict(from_attributes=True)

    generated_at: datetime = Field(
        ..., description="Timestamp when metrics were computed"
    )
    organizations: OrganizationOverviewCounters = Field(
        ..., description="Tenant organization counters"
    )
    entities: PlatformEntityCounters = Field(
        ..., description="Platform scale and live usage counters"
    )
    saas_economics: PlatformSaaSEconomics = Field(
        ..., description="Platform subscription SaaS economics"
    )
    subscription_distribution: list[SubscriptionTierMetric] = Field(
        ..., description="Breakdown by subscription plan tier"
    )
    monthly_trends: list[MonthlyGrowthMetric] = Field(
        default_factory=list,
        description="Monthly growth trends for the last 6 months",
    )
    expiring_trials: list[ExpiringTrialOrg] = Field(
        default_factory=list,
        description="Tenants with trials expiring in next 7 days",
    )
    recent_audits: list[RecentAuditFeedItem] = Field(
        default_factory=list,
        description="Recent platform audit trail events",
    )
