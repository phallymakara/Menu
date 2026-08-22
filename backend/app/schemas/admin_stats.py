from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class OrganizationOverviewCounters(BaseModel):
    """Platform-wide organization tenant status counters."""

    model_config = ConfigDict(from_attributes=True)

    total_organizations: int = Field(..., description="Total organizations registered on the platform")
    active_organizations: int = Field(..., description="Active organizations")
    trial_organizations: int = Field(..., description="Organizations currently on a trial plan")
    suspended_organizations: int = Field(..., description="Suspended organizations")
    archived_organizations: int = Field(..., description="Archived/deactivated organizations")


class PlatformEntityCounters(BaseModel):
    """Platform-wide infrastructure scale counters."""

    model_config = ConfigDict(from_attributes=True)

    total_businesses: int = Field(..., description="Total restaurant brands/businesses")
    total_branches: int = Field(..., description="Total physical branch outlets")
    total_active_branches: int = Field(..., description="Total active branch outlets")
    total_registered_users: int = Field(..., description="Total registered platform user accounts")
    total_staff_memberships: int = Field(..., description="Total staff memberships across all tenants")
    active_table_sessions: int = Field(..., description="Total active dining sessions live right now")


class SubscriptionTierMetric(BaseModel):
    """Organization distribution per subscription plan tier."""

    model_config = ConfigDict(from_attributes=True)

    plan_code: str = Field(..., description="Unique plan code, e.g. free, pro, enterprise")
    plan_name: str = Field(..., description="Display name of the subscription plan")
    price_monthly_usd: Decimal = Field(..., description="Monthly subscription price in USD")
    organization_count: int = Field(..., description="Number of organizations on this plan")
    percentage_of_total: float = Field(..., description="Percentage of total organizations")


class PlatformSaaSEconomics(BaseModel):
    """SaaS platform-level subscription economics and tenant growth."""

    model_config = ConfigDict(from_attributes=True)

    estimated_mrr_usd: Decimal = Field(..., description="Estimated Monthly Recurring Revenue from subscriptions (USD)")
    estimated_arr_usd: Decimal = Field(..., description="Estimated Annualized Run Rate from subscriptions (USD)")
    new_tenants_last_30d: int = Field(..., description="New organizations registered in the last 30 days")
    tenant_growth_percentage_30d: float = Field(..., description="30-day tenant signup growth rate")
    active_tenant_churn_rate: float = Field(..., description="Tenant churn percentage based on cancellations")


class PlatformKPIResponse(BaseModel):
    """Consolidated Super Admin Platform KPI Dashboard response payload."""

    model_config = ConfigDict(from_attributes=True)

    generated_at: datetime = Field(..., description="Timestamp when metrics were computed")
    organizations: OrganizationOverviewCounters = Field(..., description="Tenant organization counters")
    entities: PlatformEntityCounters = Field(..., description="Platform scale and live usage counters")
    saas_economics: PlatformSaaSEconomics = Field(..., description="Platform subscription SaaS economics")
    subscription_distribution: list[SubscriptionTierMetric] = Field(..., description="Breakdown by subscription plan tier")
