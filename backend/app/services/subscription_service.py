from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    EntitlementLimitExceededError,
    PermissionDeniedError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.enums import (
    BillingCycle,
    MembershipStatus,
    StaffRole,
    SubscriptionStatus,
)
from app.models.organization_membership import OrganizationMembership
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.schemas.subscription import (
    ChangePlanRequest,
    PlanResponse,
    SubscriptionResponse,
)

logger = structlog.get_logger("app.services.subscription_service")

DEFAULT_PLANS_DATA = [
    {
        "name": "Starter",
        "code": "starter",
        "description": "Ideal for small cafés, bakeries, or single food stalls.",
        "price_usd_monthly": Decimal("10.00"),
        "price_usd_annually": Decimal("100.00"),
        "max_branches": 1,
        "max_staff": 3,
        "feature_flags": {
            "qr_ordering": False,
            "kds": False,
            "khqr": False,
            "analytics": True,
        },
    },
    {
        "name": "Standard",
        "code": "standard",
        "description": "Complete operations with QR ordering, Kitchen Display & KHQR.",
        "price_usd_monthly": Decimal("25.00"),
        "price_usd_annually": Decimal("250.00"),
        "max_branches": 3,
        "max_staff": 15,
        "feature_flags": {
            "qr_ordering": True,
            "kds": True,
            "khqr": True,
            "analytics": True,
        },
    },
    {
        "name": "Growth",
        "code": "growth",
        "description": "Multi-branch operations with centralized reporting.",
        "price_usd_monthly": Decimal("50.00"),
        "price_usd_annually": Decimal("500.00"),
        "max_branches": 10,
        "max_staff": 50,
        "feature_flags": {
            "qr_ordering": True,
            "kds": True,
            "khqr": True,
            "analytics": True,
            "promotions": True,
            "multi_branch_reports": True,
        },
    },
]


async def ensure_default_plans(session: AsyncSession) -> dict[str, Plan]:
    """
    Ensures that default subscription tiers (Starter, Standard, Growth) exist.
    """
    result = await session.execute(select(Plan))
    existing_plans = {p.code: p for p in result.scalars().all()}

    new_plans = []
    for plan_data in DEFAULT_PLANS_DATA:
        if plan_data["code"] not in existing_plans:
            plan = Plan(
                name=plan_data["name"],
                code=plan_data["code"],
                description=plan_data["description"],
                price_usd_monthly=plan_data["price_usd_monthly"],
                price_usd_annually=plan_data["price_usd_annually"],
                max_branches=plan_data["max_branches"],
                max_staff=plan_data["max_staff"],
                feature_flags=plan_data["feature_flags"],
                is_active=True,
                is_public=True,
            )
            session.add(plan)
            new_plans.append(plan)

    if new_plans:
        await session.flush()
        for p in new_plans:
            existing_plans[p.code] = p

    return existing_plans


async def provision_trial_subscription(
    session: AsyncSession,
    organization_id: UUID,
) -> Subscription:
    """
    Provisions a 30-day Free Trial of the Standard plan for a newly registered tenant.
    """
    plans = await ensure_default_plans(session)
    standard_plan = plans.get("standard") or list(plans.values())[0]

    now = datetime.now(UTC)
    trial_ends = now + timedelta(days=30)

    subscription = Subscription(
        organization_id=organization_id,
        plan_id=standard_plan.id,
        status=SubscriptionStatus.TRIAL,
        billing_cycle=BillingCycle.TRIAL,
        trial_starts_at=now,
        trial_ends_at=trial_ends,
        current_period_starts_at=now,
        current_period_ends_at=trial_ends,
    )
    session.add(subscription)
    await session.flush()

    logger.info(
        "Auto-provisioned 30-day trial subscription",
        organization_id=str(organization_id),
        plan=standard_plan.code,
        trial_ends=str(trial_ends),
    )
    return subscription


async def _get_or_provision_subscription(
    session: AsyncSession,
    organization_id: UUID,
) -> Subscription:
    """Helper to fetch or auto-provision subscription."""
    result = await session.execute(
        select(Subscription)
        .options(selectinload(Subscription.plan))
        .where(Subscription.organization_id == organization_id)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        sub = await provision_trial_subscription(session, organization_id)
        # Reload with plan loaded
        reload_res = await session.execute(
            select(Subscription)
            .options(selectinload(Subscription.plan))
            .where(Subscription.id == sub.id)
        )
        sub = reload_res.scalar_one()

    return sub


async def check_branch_entitlement(
    session: AsyncSession,
    organization_id: UUID,
) -> None:
    """
    Verifies that the organization has not reached its max_branches limit.
    """
    sub = await _get_or_provision_subscription(session, organization_id)

    if sub.status in (
        SubscriptionStatus.SUSPENDED,
        SubscriptionStatus.CANCELLED,
        SubscriptionStatus.EXPIRED,
    ):
        raise EntitlementLimitExceededError(
            f"Organization subscription is {sub.status.value}. Please renew your plan."
        )

    branch_count_res = await session.execute(
        select(func.count(Branch.id)).where(
            Branch.organization_id == organization_id,
            Branch.is_active.is_(True),
        )
    )
    current_count = branch_count_res.scalar_one()

    if current_count >= sub.plan.max_branches:
        logger.warning(
            "Branch limit exceeded",
            organization_id=str(organization_id),
            current=current_count,
            limit=sub.plan.max_branches,
            plan=sub.plan.name,
        )
        raise EntitlementLimitExceededError(
            f"Branch limit reached ({sub.plan.max_branches} allowed on "
            f"{sub.plan.name} plan). Please upgrade your subscription to add branches."
        )


async def check_staff_entitlement(
    session: AsyncSession,
    organization_id: UUID,
) -> None:
    """
    Verifies that the organization has not reached its max_staff limit.
    """
    sub = await _get_or_provision_subscription(session, organization_id)

    if sub.status in (
        SubscriptionStatus.SUSPENDED,
        SubscriptionStatus.CANCELLED,
        SubscriptionStatus.EXPIRED,
    ):
        raise EntitlementLimitExceededError(
            f"Organization subscription is {sub.status.value}. Please renew your plan."
        )

    staff_count_res = await session.execute(
        select(func.count(OrganizationMembership.id)).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.status.in_(
                [MembershipStatus.ACTIVE, MembershipStatus.INVITED]
            ),
        )
    )
    current_count = staff_count_res.scalar_one()

    if current_count >= sub.plan.max_staff:
        logger.warning(
            "Staff limit exceeded",
            organization_id=str(organization_id),
            current=current_count,
            limit=sub.plan.max_staff,
            plan=sub.plan.name,
        )
        raise EntitlementLimitExceededError(
            f"Staff limit reached ({sub.plan.max_staff} allowed on "
            f"{sub.plan.name} plan). Please upgrade your subscription."
        )


async def list_available_plans(session: AsyncSession) -> list[Plan]:
    """Lists all active and public subscription plans."""
    await ensure_default_plans(session)
    result = await session.execute(
        select(Plan)
        .where(Plan.is_active.is_(True), Plan.is_public.is_(True))
        .order_by(Plan.price_usd_monthly.asc())
    )
    return list(result.scalars().all())


async def get_organization_subscription_details(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
) -> SubscriptionResponse:
    """
    Retrieves subscription details and current resource usage.
    """
    if tenant.organization_id != org_id:
        raise TenantNotFoundError("Organization not found.")

    sub = await _get_or_provision_subscription(session, org_id)

    # Count branches
    b_res = await session.execute(
        select(func.count(Branch.id)).where(
            Branch.organization_id == org_id,
            Branch.is_active.is_(True),
        )
    )
    branch_count = b_res.scalar_one()

    # Count staff
    s_res = await session.execute(
        select(func.count(OrganizationMembership.id)).where(
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.status.in_(
                [MembershipStatus.ACTIVE, MembershipStatus.INVITED]
            ),
        )
    )
    staff_count = s_res.scalar_one()

    days_remaining = None
    if sub.trial_ends_at is not None:
        now = datetime.now(UTC)
        ends = sub.trial_ends_at
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=UTC)
        days_remaining = max(0, (ends - now).days)

    return SubscriptionResponse(
        id=sub.id,
        organization_id=sub.organization_id,
        plan=PlanResponse.model_validate(sub.plan),
        status=sub.status,
        billing_cycle=sub.billing_cycle,
        trial_starts_at=sub.trial_starts_at,
        trial_ends_at=sub.trial_ends_at,
        days_remaining_in_trial=days_remaining,
        current_period_starts_at=sub.current_period_starts_at,
        current_period_ends_at=sub.current_period_ends_at,
        cancelled_at=sub.cancelled_at,
        current_branch_count=branch_count,
        current_staff_count=staff_count,
    )


async def change_organization_plan(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
    payload: ChangePlanRequest,
) -> SubscriptionResponse:
    """
    Upgrades, downgrades, or changes subscription plan tier for an organization.
    """
    if tenant.organization_id != org_id:
        raise TenantNotFoundError("Organization not found.")

    # Caller must be owner
    caller_mem_res = await session.execute(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.user_id == tenant.user_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
        )
    )
    caller = caller_mem_res.scalar_one_or_none()
    if caller is None or (not caller.is_owner and caller.role != StaffRole.OWNER):
        raise PermissionDeniedError(
            "Only organization owners can change the subscription plan."
        )

    # Find target plan
    plan_res = await session.execute(
        select(Plan).where(Plan.code == payload.plan_code, Plan.is_active.is_(True))
    )
    target_plan = plan_res.scalar_one_or_none()
    if target_plan is None:
        raise TenantNotFoundError(f"Plan with code '{payload.plan_code}' not found.")

    sub = await _get_or_provision_subscription(session, org_id)

    # Check if current branches or staff exceed target plan limits
    b_res = await session.execute(
        select(func.count(Branch.id)).where(
            Branch.organization_id == org_id,
            Branch.is_active.is_(True),
        )
    )
    current_branches = b_res.scalar_one()
    if current_branches > target_plan.max_branches:
        raise EntitlementLimitExceededError(
            f"Cannot switch to {target_plan.name} plan: organization currently has "
            f"{current_branches} branches (max {target_plan.max_branches} allowed)."
        )

    s_res = await session.execute(
        select(func.count(OrganizationMembership.id)).where(
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.status.in_(
                [MembershipStatus.ACTIVE, MembershipStatus.INVITED]
            ),
        )
    )
    current_staff = s_res.scalar_one()
    if current_staff > target_plan.max_staff:
        raise EntitlementLimitExceededError(
            f"Cannot switch to {target_plan.name} plan: organization currently has "
            f"{current_staff} staff members (max {target_plan.max_staff} allowed)."
        )

    now = datetime.now(UTC)
    period_days = 365 if payload.billing_cycle == BillingCycle.ANNUAL else 30

    sub.plan_id = target_plan.id
    sub.status = SubscriptionStatus.ACTIVE
    sub.billing_cycle = payload.billing_cycle
    sub.current_period_starts_at = now
    sub.current_period_ends_at = now + timedelta(days=period_days)

    await session.commit()
    await session.refresh(sub)

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="SUBSCRIPTION_CHANGED",
        organization_id=org_id,
        user_id=tenant.user_id,
        resource_type="subscription",
        resource_id=str(sub.id),
        details={
            "new_plan": target_plan.code,
            "billing_cycle": payload.billing_cycle.value,
        },
    )
    await session.commit()

    logger.info(
        "Subscription plan updated successfully",
        org_id=str(org_id),
        new_plan=target_plan.code,
        billing_cycle=payload.billing_cycle.value,
    )

    return await get_organization_subscription_details(session, tenant, org_id)
