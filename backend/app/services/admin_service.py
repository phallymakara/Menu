from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import (
    OrganizationStatus,
    SubscriptionStatus,
    TableSessionStatus,
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.table_session import TableSession
from app.models.user import User
from app.schemas.admin_stats import (
    OrganizationOverviewCounters,
    PlatformEntityCounters,
    PlatformKPIResponse,
    PlatformSaaSEconomics,
    SubscriptionTierMetric,
)

logger = structlog.get_logger("app.services.admin_service")


# ==============================================================================
# 1. PLATFORM-WIDE ANALYTICS & KPI COMPUTATION
# ==============================================================================


async def get_platform_kpi_stats(session: AsyncSession) -> PlatformKPIResponse:
    """
    Aggregates high-level SaaS platform statistics, tenant health, infrastructure scale,
    and subscription economics for the Super Admin platform owner.
    """
    now_utc = datetime.now(timezone.utc)
    thirty_days_ago = now_utc - timedelta(days=30)

    # 1. Organization Tenant Counters
    total_orgs_res = await session.execute(select(func.count(Organization.id)))
    total_orgs = total_orgs_res.scalar_one() or 0

    active_orgs_res = await session.execute(
        select(func.count(Organization.id)).where(
            Organization.status == OrganizationStatus.ACTIVE,
            Organization.is_active.is_(True),
        )
    )
    active_orgs = active_orgs_res.scalar_one() or 0

    suspended_orgs_res = await session.execute(
        select(func.count(Organization.id)).where(
            Organization.status == OrganizationStatus.SUSPENDED
        )
    )
    suspended_orgs = suspended_orgs_res.scalar_one() or 0

    archived_orgs_res = await session.execute(
        select(func.count(Organization.id)).where(
            Organization.status == OrganizationStatus.ARCHIVED
        )
    )
    archived_orgs = archived_orgs_res.scalar_one() or 0

    trial_orgs_res = await session.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == SubscriptionStatus.TRIAL
        )
    )
    trial_orgs = trial_orgs_res.scalar_one() or 0

    org_counters = OrganizationOverviewCounters(
        total_organizations=total_orgs,
        active_organizations=active_orgs,
        trial_organizations=trial_orgs,
        suspended_organizations=suspended_orgs,
        archived_organizations=archived_orgs,
    )

    # 2. Platform Infrastructure Scale Counters
    biz_res = await session.execute(select(func.count(Business.id)))
    total_biz = biz_res.scalar_one() or 0

    branches_res = await session.execute(select(func.count(Branch.id)))
    total_branches = branches_res.scalar_one() or 0

    active_branches_res = await session.execute(
        select(func.count(Branch.id)).where(Branch.is_active.is_(True))
    )
    active_branches = active_branches_res.scalar_one() or 0

    users_res = await session.execute(select(func.count(User.id)))
    total_users = users_res.scalar_one() or 0

    memberships_res = await session.execute(
        select(func.count(OrganizationMembership.id))
    )
    total_memberships = memberships_res.scalar_one() or 0

    active_sessions_res = await session.execute(
        select(func.count(TableSession.id)).where(
            TableSession.status == TableSessionStatus.ACTIVE
        )
    )
    active_sessions = active_sessions_res.scalar_one() or 0

    entity_counters = PlatformEntityCounters(
        total_businesses=total_biz,
        total_branches=total_branches,
        total_active_branches=active_branches,
        total_registered_users=total_users,
        total_staff_memberships=total_memberships,
        active_table_sessions=active_sessions,
    )

    # 3. SaaS Subscription Economics & Tenant Growth
    paid_subs_res = await session.execute(
        select(func.coalesce(func.sum(Plan.price_usd_monthly), Decimal("0.00")))
        .select_from(Subscription)
        .join(Plan, Subscription.plan_id == Plan.id)
        .where(
            Subscription.status.in_(
                [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD]
            )
        )
    )
    estimated_mrr = Decimal(str(paid_subs_res.scalar_one() or "0.00"))
    estimated_arr = estimated_mrr * Decimal("12.00")

    # New organizations in the last 30 days
    new_tenants_res = await session.execute(
        select(func.count(Organization.id)).where(
            Organization.created_at >= thirty_days_ago
        )
    )
    new_tenants_30d = new_tenants_res.scalar_one() or 0

    prior_tenants = total_orgs - new_tenants_30d
    growth_pct = (
        round((new_tenants_30d / prior_tenants) * 100.0, 2)
        if prior_tenants > 0
        else (100.0 if new_tenants_30d > 0 else 0.0)
    )

    # Churned/Cancelled subscriptions
    churned_res = await session.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status.in_(
                [
                    SubscriptionStatus.CANCELLED,
                    SubscriptionStatus.EXPIRED,
                    SubscriptionStatus.SUSPENDED,
                ]
            )
        )
    )
    churned_count = churned_res.scalar_one() or 0
    churn_rate = (
        round((churned_count / total_orgs) * 100.0, 2) if total_orgs > 0 else 0.0
    )

    saas_economics = PlatformSaaSEconomics(
        estimated_mrr_usd=estimated_mrr,
        estimated_arr_usd=estimated_arr,
        new_tenants_last_30d=new_tenants_30d,
        tenant_growth_percentage_30d=growth_pct,
        active_tenant_churn_rate=churn_rate,
    )

    # 4. Subscription Tier Distribution
    plans_query = select(
        Plan.code,
        Plan.name,
        Plan.price_usd_monthly,
        func.count(Subscription.id).label("org_count"),
    ).select_from(Plan).outerjoin(
        Subscription, Subscription.plan_id == Plan.id
    ).group_by(Plan.id, Plan.code, Plan.name, Plan.price_usd_monthly).order_by(
        Plan.price_usd_monthly.asc()
    )

    plans_res = await session.execute(plans_query)
    tier_metrics: list[SubscriptionTierMetric] = []
    for row in plans_res.all():
        plan_code, plan_name, monthly_price, count = row
        pct = round((count / total_orgs) * 100.0, 2) if total_orgs > 0 else 0.0
        tier_metrics.append(
            SubscriptionTierMetric(
                plan_code=plan_code,
                plan_name=plan_name,
                price_monthly_usd=monthly_price,
                organization_count=count,
                percentage_of_total=pct,
            )
        )

    logger.info(
        "Platform Super Admin KPI stats computed",
        total_orgs=total_orgs,
        active_orgs=active_orgs,
        estimated_mrr=float(estimated_mrr),
    )

    return PlatformKPIResponse(
        generated_at=now_utc,
        organizations=org_counters,
        entities=entity_counters,
        saas_economics=saas_economics,
        subscription_distribution=tier_metrics,
    )
