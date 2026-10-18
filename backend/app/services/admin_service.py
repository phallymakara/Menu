from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import (
    OrderStatus,
    OrganizationStatus,
    SubscriptionStatus,
)
from app.models.order import Order
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.admin_stats import (
    ExpiringTrialOrg,
    MonthlyGrowthMetric,
    OrganizationOverviewCounters,
    PlatformEntityCounters,
    PlatformKPIResponse,
    PlatformSaaSEconomics,
    RecentAuditFeedItem,
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
    seven_days_from_now = now_utc + timedelta(days=7)

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

    entity_counters = PlatformEntityCounters(
        total_businesses=total_biz,
        total_branches=total_branches,
        total_active_branches=active_branches,
        total_registered_users=total_users,
        total_staff_memberships=total_memberships,
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

    # Platform Gross Merchandise Value (All non-cancelled orders)
    gmv_res = await session.execute(
        select(
            func.coalesce(func.sum(Order.total_amount_usd), Decimal("0.00")),
            func.count(Order.id),
        ).where(Order.status != OrderStatus.CANCELLED)
    )
    total_gmv_val, total_orders = gmv_res.one()
    total_gmv = Decimal(str(total_gmv_val or "0.00"))

    # Expiring trials count (within next 7 days)
    expiring_count_res = await session.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == SubscriptionStatus.TRIAL,
            Subscription.trial_ends_at.is_not(None),
            Subscription.trial_ends_at <= seven_days_from_now,
            Subscription.trial_ends_at >= now_utc - timedelta(hours=12),
        )
    )
    trials_expiring_soon_count = expiring_count_res.scalar_one() or 0

    saas_economics = PlatformSaaSEconomics(
        estimated_mrr_usd=estimated_mrr,
        estimated_arr_usd=estimated_arr,
        new_tenants_last_30d=new_tenants_30d,
        tenant_growth_percentage_30d=growth_pct,
        active_tenant_churn_rate=churn_rate,
        total_gmv_usd=total_gmv,
        total_orders_count=total_orders,
        trials_expiring_soon_count=trials_expiring_soon_count,
    )

    # 4. Subscription Tier Distribution
    plans_query = (
        select(
            Plan.code,
            Plan.name,
            Plan.price_usd_monthly,
            func.count(Subscription.id).label("org_count"),
        )
        .select_from(Plan)
        .outerjoin(Subscription, Subscription.plan_id == Plan.id)
        .group_by(Plan.id, Plan.code, Plan.name, Plan.price_usd_monthly)
        .order_by(Plan.price_usd_monthly.asc())
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

    # 5. Monthly Growth Trends (Last 6 Months)
    monthly_trends: list[MonthlyGrowthMetric] = []
    for i in range(5, -1, -1):
        target_month_date = now_utc - timedelta(days=i * 30)
        month_key = target_month_date.strftime("%Y-%m")
        month_label = target_month_date.strftime("%b")

        month_end = target_month_date.replace(hour=23, minute=59, second=59)
        cum_res = await session.execute(
            select(func.count(Organization.id)).where(
                Organization.created_at <= month_end
            )
        )
        cum_tenants = cum_res.scalar_one() or 0

        window_start = target_month_date - timedelta(days=30)
        window_new_res = await session.execute(
            select(func.count(Organization.id)).where(
                Organization.created_at >= window_start,
                Organization.created_at <= month_end,
            )
        )
        new_in_window = window_new_res.scalar_one() or 0

        month_rev = (
            (
                estimated_mrr
                * Decimal(str(cum_tenants))
                / Decimal(str(max(1, total_orgs)))
            )
            if total_orgs > 0
            else Decimal("0.00")
        )

        monthly_trends.append(
            MonthlyGrowthMetric(
                month_key=month_key,
                month_label=month_label,
                revenue_usd=round(month_rev, 2),
                new_tenants=new_in_window,
                cumulative_tenants=cum_tenants,
            )
        )

    # 6. Expiring Trials Roster (Organizations)
    expiring_trials_query = (
        select(
            Organization.id,
            Organization.name,
            Organization.slug,
            Plan.name,
            Subscription.trial_ends_at,
        )
        .select_from(Subscription)
        .join(Organization, Subscription.organization_id == Organization.id)
        .join(Plan, Subscription.plan_id == Plan.id)
        .where(
            Subscription.status == SubscriptionStatus.TRIAL,
            Subscription.trial_ends_at.is_not(None),
            Subscription.trial_ends_at <= seven_days_from_now,
            Subscription.trial_ends_at >= now_utc - timedelta(hours=12),
        )
        .order_by(Subscription.trial_ends_at.asc())
        .limit(10)
    )
    expiring_res = await session.execute(expiring_trials_query)
    expiring_trial_orgs: list[ExpiringTrialOrg] = []
    for row in expiring_res.all():
        org_id, org_name, org_slug, plan_name, trial_end = row
        days_left = max(0, (trial_end - now_utc).days if trial_end else 0)
        expiring_trial_orgs.append(
            ExpiringTrialOrg(
                organization_id=str(org_id),
                organization_name=org_name,
                organization_slug=org_slug,
                plan_name=plan_name,
                trial_ends_at=trial_end,
                days_remaining=days_left,
            )
        )

    # 7. Recent Platform Audit Events
    recent_audits_query = (
        select(
            AuditLog.id,
            AuditLog.action,
            AuditLog.resource_type,
            AuditLog.resource_id,
            AuditLog.created_at,
            User.full_name.label("actor_name"),
            User.email.label("actor_email"),
            Organization.name.label("organization_name"),
        )
        .select_from(AuditLog)
        .outerjoin(User, AuditLog.user_id == User.id)
        .outerjoin(Organization, AuditLog.organization_id == Organization.id)
        .order_by(AuditLog.created_at.desc())
        .limit(5)
    )
    audits_res = await session.execute(recent_audits_query)
    recent_audits: list[RecentAuditFeedItem] = []
    for r in audits_res.all():
        recent_audits.append(
            RecentAuditFeedItem(
                id=str(r.id),
                action=r.action,
                resource_type=r.resource_type,
                resource_id=r.resource_id,
                actor_name=r.actor_name,
                actor_email=r.actor_email,
                organization_name=r.organization_name,
                created_at=r.created_at,
            )
        )

    logger.info(
        "Platform Super Admin KPI stats computed",
        total_orgs=total_orgs,
        active_orgs=active_orgs,
        estimated_mrr=float(estimated_mrr),
        total_gmv=float(total_gmv),
        trials_expiring=trials_expiring_soon_count,
    )

    return PlatformKPIResponse(
        generated_at=now_utc,
        organizations=org_counters,
        entities=entity_counters,
        saas_economics=saas_economics,
        subscription_distribution=tier_metrics,
        monthly_trends=monthly_trends,
        expiring_trials=expiring_trial_orgs,
        recent_audits=recent_audits,
    )
