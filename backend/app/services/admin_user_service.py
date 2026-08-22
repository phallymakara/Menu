from __future__ import annotations

import math
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.models.branch import Branch
from app.models.enums import UserStatus
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.schemas.admin_user import (
    AdminMembershipDetail,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserListResponse,
    AdminUserPlatformAdminToggle,
    AdminUserResetPasswordRequest,
    AdminUserStatusUpdate,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.admin_user_service")


# ==============================================================================
# 1. USER DIRECTORY & PAGINATED LISTING
# ==============================================================================


async def list_admin_users(
    session: AsyncSession,
    search: str | None = None,
    status_filter: UserStatus | None = None,
    is_platform_admin: bool | None = None,
    organization_id: UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> AdminUserListResponse:
    """
    Returns a paginated list of all platform user accounts with search and filtering
    for the Super Admin platform owner.
    """
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    if page_size > 100:
        page_size = 100

    offset = (page - 1) * page_size

    base_query = (
        select(User)
        .options(
            selectinload(User.memberships),
        )
        .order_by(User.created_at.desc())
    )

    if status_filter:
        base_query = base_query.where(User.status == status_filter)

    if is_platform_admin is not None:
        base_query = base_query.where(User.is_platform_admin == is_platform_admin)

    if search:
        search_term = f"%{search.strip()}%"
        base_query = base_query.where(
            or_(
                User.full_name.ilike(search_term),
                User.email.ilike(search_term),
                User.phone.ilike(search_term),
            )
        )

    if organization_id:
        base_query = base_query.join(
            OrganizationMembership, OrganizationMembership.user_id == User.id
        ).where(OrganizationMembership.organization_id == organization_id)

    count_query = select(func.count()).select_from(base_query.subquery())
    total_res = await session.execute(count_query)
    total = total_res.scalar_one() or 0

    paged_query = base_query.offset(offset).limit(page_size)
    result = await session.execute(paged_query)
    users = result.scalars().all()

    items: list[AdminUserListItem] = []
    for u in users:
        org_count = len(u.memberships) if u.memberships else 0
        items.append(
            AdminUserListItem(
                id=u.id,
                full_name=u.full_name,
                email=u.email,
                phone=u.phone,
                status=u.status,
                preferred_language=u.preferred_language,
                is_platform_admin=u.is_platform_admin,
                is_verified=u.is_verified,
                organizations_count=org_count,
                created_at=u.created_at,
                updated_at=u.updated_at,
            )
        )

    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return AdminUserListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ==============================================================================
# 2. DEEP USER PROFILE & MEMBERSHIPS INSPECTION
# ==============================================================================


async def get_admin_user_detail(
    session: AsyncSession,
    user_id: UUID,
) -> AdminUserDetail:
    """
    Retrieves a user's full profile along with all organization memberships,
    assigned roles, and branch links.
    """
    query = (
        select(User)
        .options(
            selectinload(User.memberships).selectinload(
                OrganizationMembership.organization
            ),
        )
        .where(User.id == user_id)
    )
    res = await session.execute(query)
    u = res.scalar_one_or_none()

    if u is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found.",
        )

    memberships: list[AdminMembershipDetail] = []
    for m in u.memberships:
        org = m.organization
        branch_name = None
        if m.branch_id:
            b_res = await session.execute(
                select(Branch).where(Branch.id == m.branch_id)
            )
            b = b_res.scalar_one_or_none()
            branch_name = b.name_en if b else None

        memberships.append(
            AdminMembershipDetail(
                id=m.id,
                organization_id=org.id,
                organization_name=org.name,
                organization_slug=org.slug,
                organization_status=org.status.value,
                role=m.role.value if hasattr(m.role, "value") else str(m.role),
                status=m.status.value if hasattr(m.status, "value") else str(m.status),
                is_owner=m.is_owner,
                job_title=m.job_title,
                branch_id=m.branch_id,
                branch_name=branch_name,
                created_at=m.created_at,
            )
        )

    return AdminUserDetail(
        id=u.id,
        full_name=u.full_name,
        email=u.email,
        phone=u.phone,
        status=u.status,
        preferred_language=u.preferred_language,
        is_platform_admin=u.is_platform_admin,
        is_verified=u.is_verified,
        memberships=memberships,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


# ==============================================================================
# 3. USER ACCOUNT STATUS LIFECYCLE (SUSPEND / ACTIVATE / TERMINATE)
# ==============================================================================


async def update_admin_user_status(
    session: AsyncSession,
    user_id: UUID,
    payload: AdminUserStatusUpdate,
    admin_user: User,
) -> AdminUserDetail:
    """
    Updates a user's account status (ACTIVE, SUSPENDED, TERMINATED, ARCHIVED).
    Prevents self-suspension/termination of the acting Super Admin.
    """
    if user_id == admin_user.id and payload.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot suspend or terminate your own administrator account.",
        )

    query = select(User).where(User.id == user_id)
    res = await session.execute(query)
    target_user = res.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found.",
        )

    previous_status = target_user.status
    target_user.status = payload.status

    await record_audit_log(
        session=session,
        organization_id=None,
        user_id=admin_user.id,
        action="admin.user.status_updated",
        resource_type="user",
        resource_id=str(target_user.id),
        details={
            "previous_status": previous_status.value,
            "new_status": payload.status.value,
            "reason": payload.reason,
            "admin_user_id": str(admin_user.id),
            "admin_email": admin_user.email,
        },
    )

    await session.commit()
    logger.info(
        "User status updated by Super Admin",
        target_user_id=str(target_user.id),
        previous_status=previous_status.value,
        new_status=payload.status.value,
        admin_email=admin_user.email,
    )

    return await get_admin_user_detail(session=session, user_id=user_id)


# ==============================================================================
# 4. SUPER ADMIN PRIVILEGE ESCALATION & TOGGLING
# ==============================================================================


async def toggle_admin_user_platform_admin(
    session: AsyncSession,
    user_id: UUID,
    payload: AdminUserPlatformAdminToggle,
    admin_user: User,
) -> AdminUserDetail:
    """
    Grants or revokes Platform Super Admin privileges.
    Guards against self-demotion to avoid accidental administrator lockout.
    """
    if user_id == admin_user.id and not payload.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot revoke your own platform administrator privileges.",
        )

    query = select(User).where(User.id == user_id)
    res = await session.execute(query)
    target_user = res.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found.",
        )

    previous_flag = target_user.is_platform_admin
    target_user.is_platform_admin = payload.is_platform_admin

    await record_audit_log(
        session=session,
        organization_id=None,
        user_id=admin_user.id,
        action="admin.user.platform_admin_toggled",
        resource_type="user",
        resource_id=str(target_user.id),
        details={
            "previous_is_platform_admin": previous_flag,
            "new_is_platform_admin": payload.is_platform_admin,
            "reason": payload.reason,
            "admin_user_id": str(admin_user.id),
        },
    )

    await session.commit()
    logger.info(
        "User platform admin privileges toggled by Super Admin",
        target_user_id=str(target_user.id),
        new_is_platform_admin=payload.is_platform_admin,
        admin_email=admin_user.email,
    )

    return await get_admin_user_detail(session=session, user_id=user_id)


# ==============================================================================
# 5. EMERGENCY ADMINISTRATIVE PASSWORD RESET
# ==============================================================================


async def reset_admin_user_password(
    session: AsyncSession,
    user_id: UUID,
    payload: AdminUserResetPasswordRequest,
    admin_user: User,
) -> AdminUserDetail:
    """
    Resets a user's password with a new Argon2id hash.
    Used for customer support and account recovery.
    """
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long.",
        )

    query = select(User).where(User.id == user_id)
    res = await session.execute(query)
    target_user = res.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found.",
        )

    target_user.password_hash = hash_password(payload.new_password)

    await record_audit_log(
        session=session,
        organization_id=None,
        user_id=admin_user.id,
        action="admin.user.password_reset",
        resource_type="user",
        resource_id=str(target_user.id),
        details={
            "reason": payload.reason,
            "admin_user_id": str(admin_user.id),
            "admin_email": admin_user.email,
        },
    )

    await session.commit()
    logger.info(
        "User password reset by Super Admin",
        target_user_id=str(target_user.id),
        admin_email=admin_user.email,
    )

    return await get_admin_user_detail(session=session, user_id=user_id)
