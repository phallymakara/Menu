from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import SubscriptionStatus
from app.models.organization import Organization
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.admin_plan import (
    AdminPlanCreateRequest,
    AdminPlanDetail,
    AdminPlanListItem,
    AdminPlanSubscriberItem,
    AdminPlanUpdateRequest,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.admin_plan_service")


# ==============================================================================
# 1. LIST PLANS WITH ACTIVE SUBSCRIBER COUNTS
# ==============================================================================


async def list_admin_plans(
    session: AsyncSession,
    include_inactive: bool = True,
) -> list[AdminPlanListItem]:
    """
    Returns all subscription plans along with the count of active tenant subscribers.
    """
    query = select(Plan).order_by(Plan.price_usd_monthly.asc())
    if not include_inactive:
        query = query.where(Plan.is_active.is_(True))

    res = await session.execute(query)
    plans = res.scalars().all()

    items: list[AdminPlanListItem] = []
    for p in plans:
        sub_count_res = await session.execute(
            select(func.count(Subscription.id)).where(
                Subscription.plan_id == p.id,
                Subscription.status.in_(
                    [
                        SubscriptionStatus.ACTIVE,
                        SubscriptionStatus.TRIAL,
                        SubscriptionStatus.GRACE_PERIOD,
                    ]
                ),
            )
        )
        active_subscribers = sub_count_res.scalar_one() or 0

        items.append(
            AdminPlanListItem(
                id=p.id,
                code=p.code,
                name=p.name,
                description=p.description,
                price_usd_monthly=p.price_usd_monthly,
                price_usd_annually=p.price_usd_annually,
                max_branches=p.max_branches,
                max_staff=p.max_staff,
                feature_flags=p.feature_flags or {},
                is_active=p.is_active,
                is_public=p.is_public,
                active_subscribers_count=active_subscribers,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )

    return items


# ==============================================================================
# 2. PLAN DEEP INSPECTION & SUBSCRIBERS LIST
# ==============================================================================


async def get_admin_plan_detail(
    session: AsyncSession,
    plan_id: UUID,
) -> AdminPlanDetail:
    """
    Retrieves full details for a subscription plan and lists all organization subscribers.
    """
    query = (
        select(Plan)
        .options(
            selectinload(Plan.subscriptions).selectinload(Subscription.organization),
        )
        .where(Plan.id == plan_id)
    )
    res = await session.execute(query)
    p = res.scalar_one_or_none()

    if p is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription plan not found.",
        )

    subscribers: list[AdminPlanSubscriberItem] = []
    for s in p.subscriptions:
        org: Organization = s.organization
        subscribers.append(
            AdminPlanSubscriberItem(
                organization_id=org.id,
                organization_name=org.name,
                organization_slug=org.slug,
                organization_status=org.status.value,
                subscription_status=s.status.value,
                billing_cycle=s.billing_cycle.value,
                trial_ends_at=s.trial_ends_at,
                current_period_ends_at=s.current_period_ends_at,
                created_at=s.created_at,
            )
        )

    return AdminPlanDetail(
        id=p.id,
        code=p.code,
        name=p.name,
        description=p.description,
        price_usd_monthly=p.price_usd_monthly,
        price_usd_annually=p.price_usd_annually,
        max_branches=p.max_branches,
        max_staff=p.max_staff,
        feature_flags=p.feature_flags or {},
        is_active=p.is_active,
        is_public=p.is_public,
        subscribers=subscribers,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


# ==============================================================================
# 3. CREATE SUBSCRIPTION PLAN
# ==============================================================================


async def create_admin_plan(
    session: AsyncSession,
    payload: AdminPlanCreateRequest,
    admin_user: User,
) -> AdminPlanDetail:
    """
    Creates a new subscription plan with custom pricing and feature gates.
    """
    # 1. Check unique code
    existing_res = await session.execute(
        select(Plan).where(Plan.code == payload.code.strip().lower())
    )
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A subscription plan with code '{payload.code}' already exists.",
        )

    plan = Plan(
        code=payload.code.strip().lower(),
        name=payload.name.strip(),
        description=payload.description,
        price_usd_monthly=payload.price_usd_monthly,
        price_usd_annually=payload.price_usd_annually,
        max_branches=payload.max_branches,
        max_staff=payload.max_staff,
        feature_flags=payload.feature_flags or {},
        is_active=payload.is_active,
        is_public=payload.is_public,
    )
    session.add(plan)
    await session.flush()

    await record_audit_log(
        session=session,
        organization_id=None,
        user_id=admin_user.id,
        action="admin.plan.created",
        resource_type="plan",
        resource_id=str(plan.id),
        details={
            "plan_code": plan.code,
            "plan_name": plan.name,
            "price_usd_monthly": str(plan.price_usd_monthly),
            "admin_user_id": str(admin_user.id),
        },
    )

    await session.commit()
    logger.info(
        "Subscription plan created by Super Admin",
        plan_id=str(plan.id),
        plan_code=plan.code,
        admin_email=admin_user.email,
    )

    return await get_admin_plan_detail(session=session, plan_id=plan.id)


# ==============================================================================
# 4. UPDATE SUBSCRIPTION PLAN
# ==============================================================================


async def update_admin_plan(
    session: AsyncSession,
    plan_id: UUID,
    payload: AdminPlanUpdateRequest,
    admin_user: User,
) -> AdminPlanDetail:
    """
    Updates subscription plan pricing, limits, and feature toggles.
    """
    query = select(Plan).where(Plan.id == plan_id)
    res = await session.execute(query)
    plan = res.scalar_one_or_none()

    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription plan not found.",
        )

    if payload.name is not None:
        plan.name = payload.name.strip()
    if payload.description is not None:
        plan.description = payload.description
    if payload.price_usd_monthly is not None:
        plan.price_usd_monthly = payload.price_usd_monthly
    if payload.price_usd_annually is not None:
        plan.price_usd_annually = payload.price_usd_annually
    if payload.max_branches is not None:
        plan.max_branches = payload.max_branches
    if payload.max_staff is not None:
        plan.max_staff = payload.max_staff
    if payload.feature_flags is not None:
        plan.feature_flags = payload.feature_flags
    if payload.is_active is not None:
        plan.is_active = payload.is_active
    if payload.is_public is not None:
        plan.is_public = payload.is_public

    await record_audit_log(
        session=session,
        organization_id=None,
        user_id=admin_user.id,
        action="admin.plan.updated",
        resource_type="plan",
        resource_id=str(plan.id),
        details={
            "plan_code": plan.code,
            "admin_user_id": str(admin_user.id),
        },
    )

    await session.commit()
    logger.info(
        "Subscription plan updated by Super Admin",
        plan_id=str(plan.id),
        plan_code=plan.code,
        admin_email=admin_user.email,
    )

    return await get_admin_plan_detail(session=session, plan_id=plan.id)


# ==============================================================================
# 5. ARCHIVE / DEACTIVATE SUBSCRIPTION PLAN
# ==============================================================================


async def archive_admin_plan(
    session: AsyncSession,
    plan_id: UUID,
    admin_user: User,
) -> AdminPlanDetail:
    """
    Soft-archives a subscription plan by setting is_active=False and is_public=False.
    """
    query = select(Plan).where(Plan.id == plan_id)
    res = await session.execute(query)
    plan = res.scalar_one_or_none()

    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription plan not found.",
        )

    plan.is_active = False
    plan.is_public = False

    await record_audit_log(
        session=session,
        organization_id=None,
        user_id=admin_user.id,
        action="admin.plan.archived",
        resource_type="plan",
        resource_id=str(plan.id),
        details={
            "plan_code": plan.code,
            "admin_user_id": str(admin_user.id),
        },
    )

    await session.commit()
    logger.info(
        "Subscription plan archived by Super Admin",
        plan_id=str(plan.id),
        plan_code=plan.code,
        admin_email=admin_user.email,
    )

    return await get_admin_plan_detail(session=session, plan_id=plan.id)
