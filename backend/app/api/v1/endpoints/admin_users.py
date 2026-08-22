from __future__ import annotations

from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.admin import get_current_platform_admin
from app.db.session import get_db_session
from app.models.enums import UserStatus
from app.models.user import User
from app.schemas.admin_user import (
    AdminUserDetail,
    AdminUserListResponse,
    AdminUserPlatformAdminToggle,
    AdminUserResetPasswordRequest,
    AdminUserStatusUpdate,
)
from app.services.admin_user_service import (
    get_admin_user_detail,
    list_admin_users,
    reset_admin_user_password,
    toggle_admin_user_platform_admin,
    update_admin_user_status,
)

logger = structlog.get_logger("app.api.v1.endpoints.admin_users")

router = APIRouter(
    prefix="/admin/users",
    tags=["Platform Super Admin — Users"],
)


@router.get(
    "",
    response_model=AdminUserListResponse,
    status_code=status.HTTP_200_OK,
    summary="List & search all platform user accounts",
)
async def list_admin_users_endpoint(
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    search: Annotated[str | None, Query(description="Search by name, email, or phone")] = None,
    status: Annotated[UserStatus | None, Query(description="Filter by user status")] = None,
    is_platform_admin: Annotated[bool | None, Query(description="Filter by platform admin flag")] = None,
    organization_id: Annotated[UUID | None, Query(description="Filter by organization membership")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> AdminUserListResponse:
    """
    Returns a paginated list of all platform user accounts with search and filters.
    Requires Super Admin privileges (is_platform_admin=True).
    """
    return await list_admin_users(
        session=session,
        search=search,
        status_filter=status,
        is_platform_admin=is_platform_admin,
        organization_id=organization_id,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{user_id}",
    response_model=AdminUserDetail,
    status_code=status.HTTP_200_OK,
    summary="Inspect user profile & multi-tenant memberships",
)
async def get_admin_user_detail_endpoint(
    user_id: UUID,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminUserDetail:
    """
    Deep inspection of a user's account including all organization memberships,
    assigned roles, and branch links.
    """
    return await get_admin_user_detail(session=session, user_id=user_id)


@router.patch(
    "/{user_id}/status",
    response_model=AdminUserDetail,
    status_code=status.HTTP_200_OK,
    summary="Update user account status (Activate / Suspend / Terminate)",
)
async def update_admin_user_status_endpoint(
    user_id: UUID,
    payload: AdminUserStatusUpdate,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminUserDetail:
    """
    Updates the user account lifecycle status. Suspending or terminating a user
    immediately invalidates their active login capability across all tenant restaurants.
    """
    return await update_admin_user_status(
        session=session,
        user_id=user_id,
        payload=payload,
        admin_user=admin_user,
    )


@router.patch(
    "/{user_id}/platform-admin",
    response_model=AdminUserDetail,
    status_code=status.HTTP_200_OK,
    summary="Promote or revoke Super Admin privileges",
)
async def toggle_admin_user_platform_admin_endpoint(
    user_id: UUID,
    payload: AdminUserPlatformAdminToggle,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminUserDetail:
    """
    Grants or revokes Super Admin privileges. Prevents self-demotion.
    """
    return await toggle_admin_user_platform_admin(
        session=session,
        user_id=user_id,
        payload=payload,
        admin_user=admin_user,
    )


@router.post(
    "/{user_id}/reset-password",
    response_model=AdminUserDetail,
    status_code=status.HTTP_200_OK,
    summary="Administrative password reset for user account",
)
async def reset_admin_user_password_endpoint(
    user_id: UUID,
    payload: AdminUserResetPasswordRequest,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminUserDetail:
    """
    Sets a new secure password for the user, re-hashed with Argon2id.
    """
    return await reset_admin_user_password(
        session=session,
        user_id=user_id,
        payload=payload,
        admin_user=admin_user,
    )
