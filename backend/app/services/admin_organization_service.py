from __future__ import annotations

import math
from datetime import datetime, timezone
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import OrganizationStatus, SubscriptionStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.plan import Plan
from app.models.restaurant_table import RestaurantTable
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.admin_organization import (
    AdminBranchBrief,
    AdminBusinessBrief,
    AdminOrganizationDetail,
    AdminOrganizationListItem,
    AdminOrganizationListResponse,
    AdminOrganizationStatusUpdate,
    AdminOrganizationSubscriptionOverride,
    AdminSubscriptionBrief,
    AdminUserBrief,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.admin_organization_service")


# ==============================================================================
# 1. ORGANIZATION DIRECTORY & PAGINATED LISTING
# ==============================================================================


async def list_admin_organizations(
    session: AsyncSession,
    search: str | None = None,
    status_filter: OrganizationStatus | None = None,
    plan_code: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> AdminOrganizationListResponse:
    """
    Returns a paginated list of all tenant organizations with search and filtering
    for the Super Admin platform owner.
    """
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    if page_size > 100:
        page_size = 100

    offset = (page - 1) * page_size

    # Base query
    base_query = (
        select(Organization)
        .options(
            selectinload(Organization.subscription).selectinload(Subscription.plan),
            selectinload(Organization.memberships).selectinload(
                OrganizationMembership.user
            ),
            selectinload(Organization.businesses),
        )
        .order_by(Organization.created_at.desc())
    )

    # Apply Status Filter
    if status_filter:
        base_query = base_query.where(Organization.status == status_filter)

    # Apply Search Filter (organization name, slug, or owner email)
    if search:
        search_term = f"%{search.strip()}%"
        base_query = base_query.where(
            or_(
                Organization.name.ilike(search_term),
                Organization.slug.ilike(search_term),
            )
        )

    # Apply Subscription Plan Filter
    if plan_code:
        base_query = (
            base_query.join(Subscription, Subscription.organization_id == Organization.id)
            .join(Plan, Subscription.plan_id == Plan.id)
            .where(Plan.code == plan_code)
        )

    # Count total matching organizations
    count_query = select(func.count()).select_from(base_query.subquery())
    total_res = await session.execute(count_query)
    total = total_res.scalar_one() or 0

    # Paginate
    paged_query = base_query.offset(offset).limit(page_size)
    result = await session.execute(paged_query)
    organizations = result.scalars().all()

    items: list[AdminOrganizationListItem] = []
    for org in organizations:
        # Resolve Owner
        owner_membership = next(
            (m for m in org.memberships if m.is_owner and m.user),
            None,
        )
        owner_user = owner_membership.user if owner_membership else None

        # Resolve Counts
        biz_count = len(org.businesses) if org.businesses else 0

        # Query branches & tables counts
        branches_res = await session.execute(
            select(func.count(Branch.id)).where(Branch.organization_id == org.id)
        )
        branches_count = branches_res.scalar_one() or 0

        tables_res = await session.execute(
            select(func.count(RestaurantTable.id)).where(
                RestaurantTable.organization_id == org.id
            )
        )
        tables_count = tables_res.scalar_one() or 0

        staff_res = await session.execute(
            select(func.count(OrganizationMembership.id)).where(
                OrganizationMembership.organization_id == org.id
            )
        )
        staff_count = staff_res.scalar_one() or 0

        # Subscription details
        sub = org.subscription
        plan = sub.plan if sub else None

        items.append(
            AdminOrganizationListItem(
                id=org.id,
                name=org.name,
                slug=org.slug,
                status=org.status,
                is_active=org.is_active,
                owner_id=owner_user.id if owner_user else None,
                owner_name=owner_user.full_name if owner_user else None,
                owner_email=owner_user.email if owner_user else None,
                owner_phone=owner_user.phone if owner_user else None,
                businesses_count=biz_count,
                branches_count=branches_count,
                tables_count=tables_count,
                staff_count=staff_count,
                plan_id=plan.id if plan else None,
                plan_code=plan.code if plan else None,
                plan_name=plan.name if plan else None,
                subscription_status=sub.status if sub else None,
                created_at=org.created_at,
                updated_at=org.updated_at,
            )
        )

    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return AdminOrganizationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ==============================================================================
# 2. ORGANIZATION DEEP INSPECTION & PROFILE DETAIL
# ==============================================================================


async def get_admin_organization_detail(
    session: AsyncSession,
    org_id: UUID,
) -> AdminOrganizationDetail:
    """
    Retrieves comprehensive organization architecture including owner profile,
    businesses, branches, tables count, staff count, and active subscription.
    """
    query = (
        select(Organization)
        .options(
            selectinload(Organization.subscription).selectinload(Subscription.plan),
            selectinload(Organization.memberships).selectinload(
                OrganizationMembership.user
            ),
            selectinload(Organization.businesses).selectinload(Business.branches),
        )
        .where(Organization.id == org_id)
    )
    result = await session.execute(query)
    org = result.scalar_one_or_none()

    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )

    # 1. Resolve Owner
    owner_membership = next(
        (m for m in org.memberships if m.is_owner and m.user),
        None,
    )
    owner_user = owner_membership.user if owner_membership else None
    owner_brief = (
        AdminUserBrief(
            id=owner_user.id,
            full_name=owner_user.full_name,
            email=owner_user.email,
            phone=owner_user.phone,
            status=owner_user.status.value,
            created_at=owner_user.created_at,
        )
        if owner_user
        else None
    )

    # 2. Resolve Businesses & Branches
    biz_briefs: list[AdminBusinessBrief] = []
    branch_briefs: list[AdminBranchBrief] = []

    for biz in org.businesses:
        b_count = len(biz.branches) if biz.branches else 0
        biz_briefs.append(
            AdminBusinessBrief(
                id=biz.id,
                name_en=biz.name_en,
                name_km=biz.name_km,
                business_type=biz.business_type,
                base_currency=biz.base_currency,
                branches_count=b_count,
                is_active=biz.is_active,
            )
        )

        for br in biz.branches:
            t_res = await session.execute(
                select(func.count(RestaurantTable.id)).where(
                    RestaurantTable.branch_id == br.id
                )
            )
            t_count = t_res.scalar_one() or 0

            branch_briefs.append(
                AdminBranchBrief(
                    id=br.id,
                    business_id=biz.id,
                    business_name=biz.name_en,
                    name_en=br.name_en,
                    name_km=br.name_km,
                    code=br.code,
                    phone=br.phone,
                    address=br.address,
                    bakong_account_id=br.bakong_account_id,
                    tables_count=t_count,
                    is_active=br.is_active,
                )
            )

    # 3. Overall Tables and Staff Counts
    tables_res = await session.execute(
        select(func.count(RestaurantTable.id)).where(
            RestaurantTable.organization_id == org.id
        )
    )
    total_tables = tables_res.scalar_one() or 0

    staff_res = await session.execute(
        select(func.count(OrganizationMembership.id)).where(
            OrganizationMembership.organization_id == org.id
        )
    )
    total_staff = staff_res.scalar_one() or 0

    # 4. Subscription Brief
    sub = org.subscription
    sub_brief = None
    if sub and sub.plan:
        sub_brief = AdminSubscriptionBrief(
            id=sub.id,
            plan_id=sub.plan.id,
            plan_code=sub.plan.code,
            plan_name=sub.plan.name,
            price_usd_monthly=float(sub.plan.price_usd_monthly),
            status=sub.status,
            billing_cycle=sub.billing_cycle.value,
            trial_starts_at=sub.trial_starts_at,
            trial_ends_at=sub.trial_ends_at,
            current_period_starts_at=sub.current_period_starts_at,
            current_period_ends_at=sub.current_period_ends_at,
            cancelled_at=sub.cancelled_at,
        )

    return AdminOrganizationDetail(
        id=org.id,
        name=org.name,
        slug=org.slug,
        status=org.status,
        is_active=org.is_active,
        owner=owner_brief,
        businesses=biz_briefs,
        branches=branch_briefs,
        tables_count=total_tables,
        staff_count=total_staff,
        subscription=sub_brief,
        created_at=org.created_at,
        updated_at=org.updated_at,
    )


# ==============================================================================
# 3. ORGANIZATION STATUS LIFECYCLE (SUSPEND / ACTIVATE / ARCHIVE)
# ==============================================================================


async def update_admin_organization_status(
    session: AsyncSession,
    org_id: UUID,
    payload: AdminOrganizationStatusUpdate,
    admin_user: User,
) -> AdminOrganizationDetail:
    """
    Updates tenant organization status (ACTIVE, SUSPENDED, ARCHIVED) and logs an audit entry.
    When suspended or archived, sets is_active=False to block staff logins.
    """
    query = select(Organization).where(Organization.id == org_id)
    res = await session.execute(query)
    org = res.scalar_one_or_none()

    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )

    previous_status = org.status
    org.status = payload.status
    org.is_active = payload.status == OrganizationStatus.ACTIVE

    await record_audit_log(
        session=session,
        organization_id=org.id,
        user_id=admin_user.id,
        action="admin.organization.status_updated",
        resource_type="organization",
        resource_id=str(org.id),
        details={
            "previous_status": previous_status.value,
            "new_status": payload.status.value,
            "is_active": org.is_active,
            "reason": payload.reason,
            "admin_user_id": str(admin_user.id),
            "admin_email": admin_user.email,
        },
    )

    await session.commit()
    logger.info(
        "Organization status updated by Super Admin",
        org_id=str(org.id),
        previous_status=previous_status.value,
        new_status=payload.status.value,
        admin_email=admin_user.email,
    )

    return await get_admin_organization_detail(session=session, org_id=org_id)


# ==============================================================================
# 4. SUBSCRIPTION PLAN OVERRIDE & TRIAL EXTENSION
# ==============================================================================


async def override_admin_organization_subscription(
    session: AsyncSession,
    org_id: UUID,
    payload: AdminOrganizationSubscriptionOverride,
    admin_user: User,
) -> AdminOrganizationDetail:
    """
    Manually assigns a subscription plan, changes status, or extends trial dates
    for a tenant organization.
    """
    # 1. Validate Organization
    org_res = await session.execute(
        select(Organization).where(Organization.id == org_id)
    )
    org = org_res.scalar_one_or_none()
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )

    # 2. Validate Target Plan
    plan_res = await session.execute(select(Plan).where(Plan.id == payload.plan_id))
    plan = plan_res.scalar_one_or_none()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription plan not found.",
        )

    # 3. Retrieve or Create Subscription
    sub_res = await session.execute(
        select(Subscription).where(Subscription.organization_id == org_id)
    )
    subscription = sub_res.scalar_one_or_none()

    now_utc = datetime.now(timezone.utc)
    if subscription is None:
        subscription = Subscription(
            organization_id=org_id,
            plan_id=plan.id,
            status=payload.status or SubscriptionStatus.ACTIVE,
            current_period_starts_at=now_utc,
            current_period_ends_at=payload.current_period_ends_at or now_utc,
            trial_ends_at=payload.trial_ends_at,
        )
        session.add(subscription)
    else:
        subscription.plan_id = plan.id
        if payload.status:
            subscription.status = payload.status
        if payload.trial_ends_at is not None:
            subscription.trial_ends_at = payload.trial_ends_at
        if payload.current_period_ends_at is not None:
            subscription.current_period_ends_at = payload.current_period_ends_at

    await record_audit_log(
        session=session,
        organization_id=org.id,
        user_id=admin_user.id,
        action="admin.organization.subscription_overridden",
        resource_type="subscription",
        resource_id=str(subscription.id),
        details={
            "plan_id": str(plan.id),
            "plan_code": plan.code,
            "status": subscription.status.value,
            "notes": payload.notes,
            "admin_user_id": str(admin_user.id),
        },
    )

    await session.commit()
    logger.info(
        "Organization subscription overridden by Super Admin",
        org_id=str(org.id),
        plan_code=plan.code,
        admin_email=admin_user.email,
    )

    return await get_admin_organization_detail(session=session, org_id=org_id)
