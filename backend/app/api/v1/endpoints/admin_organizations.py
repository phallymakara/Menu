from __future__ import annotations

from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.admin import get_current_platform_admin
from app.db.session import get_db_session
from app.models.enums import OrganizationStatus
from app.models.user import User
from app.schemas.admin_organization import (
    AdminOrganizationDetail,
    AdminOrganizationListResponse,
    AdminOrganizationStatusUpdate,
    AdminOrganizationSubscriptionOverride,
)
from app.services.admin_organization_service import (
    get_admin_organization_detail,
    list_admin_organizations,
    override_admin_organization_subscription,
    update_admin_organization_status,
)

logger = structlog.get_logger("app.api.v1.endpoints.admin_organizations")

router = APIRouter(
    prefix="/admin/organizations",
    tags=["Platform Super Admin — Organizations"],
)


@router.get(
    "",
    response_model=AdminOrganizationListResponse,
    status_code=status.HTTP_200_OK,
    summary="List & search all tenant organizations",
)
async def list_admin_organizations_endpoint(
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    search: Annotated[str | None, Query(description="Search by name, slug, or owner")] = None,
    status: Annotated[OrganizationStatus | None, Query(description="Filter by organization status")] = None,
    plan_code: Annotated[str | None, Query(description="Filter by subscription plan code")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> AdminOrganizationListResponse:
    """
    Returns a paginated list of all tenant organizations on the platform.
    Requires Super Admin privileges (is_platform_admin=True).
    """
    return await list_admin_organizations(
        session=session,
        search=search,
        status_filter=status,
        plan_code=plan_code,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{org_id}",
    response_model=AdminOrganizationDetail,
    status_code=status.HTTP_200_OK,
    summary="Inspect detailed organization profile",
)
async def get_admin_organization_detail_endpoint(
    org_id: UUID,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminOrganizationDetail:
    """
    Deep inspection of a tenant organization including owner details, businesses,
    branches, table counts, staff count, and active subscription.
    """
    return await get_admin_organization_detail(session=session, org_id=org_id)


@router.patch(
    "/{org_id}/status",
    response_model=AdminOrganizationDetail,
    status_code=status.HTTP_200_OK,
    summary="Update organization status (Activate / Suspend / Archive)",
)
async def update_admin_organization_status_endpoint(
    org_id: UUID,
    payload: AdminOrganizationStatusUpdate,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminOrganizationDetail:
    """
    Updates the organization lifecycle status. Setting status to SUSPENDED or ARCHIVED
    sets is_active=False, instantly preventing all organization staff from accessing the platform.
    """
    return await update_admin_organization_status(
        session=session,
        org_id=org_id,
        payload=payload,
        admin_user=admin_user,
    )


@router.patch(
    "/{org_id}/subscription",
    response_model=AdminOrganizationDetail,
    status_code=status.HTTP_200_OK,
    summary="Override organization subscription plan / Extend trial",
)
async def override_admin_organization_subscription_endpoint(
    org_id: UUID,
    payload: AdminOrganizationSubscriptionOverride,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminOrganizationDetail:
    """
    Manually assign or upgrade an organization's subscription tier, extend trial dates,
    or update billing cycle dates.
    """
    return await override_admin_organization_subscription(
        session=session,
        org_id=org_id,
        payload=payload,
        admin_user=admin_user,
    )
