from __future__ import annotations

from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.admin import get_current_platform_admin
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.admin_plan import (
    AdminPlanCreateRequest,
    AdminPlanDetail,
    AdminPlanListItem,
    AdminPlanUpdateRequest,
)
from app.services.admin_plan_service import (
    archive_admin_plan,
    create_admin_plan,
    get_admin_plan_detail,
    list_admin_plans,
    update_admin_plan,
)

logger = structlog.get_logger("app.api.v1.endpoints.admin_plans")

router = APIRouter(
    prefix="/admin/plans",
    tags=["Platform Super Admin — Subscription Plans"],
)


@router.get(
    "",
    response_model=list[AdminPlanListItem],
    status_code=status.HTTP_200_OK,
    summary="List all subscription plans with subscriber counts",
)
async def list_admin_plans_endpoint(
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    include_inactive: Annotated[bool, Query(description="Include inactive/archived plans")] = True,
) -> list[AdminPlanListItem]:
    """
    Returns all subscription plans and their active subscriber counts.
    Requires Super Admin privileges (is_platform_admin=True).
    """
    return await list_admin_plans(session=session, include_inactive=include_inactive)


@router.get(
    "/{plan_id}",
    response_model=AdminPlanDetail,
    status_code=status.HTTP_200_OK,
    summary="Inspect subscription plan profile & subscribers",
)
async def get_admin_plan_detail_endpoint(
    plan_id: UUID,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminPlanDetail:
    """
    Deep inspection of a subscription plan including active subscribers.
    """
    return await get_admin_plan_detail(session=session, plan_id=plan_id)


@router.post(
    "",
    response_model=AdminPlanDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new subscription plan tier",
)
async def create_admin_plan_endpoint(
    payload: AdminPlanCreateRequest,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminPlanDetail:
    """
    Creates a new subscription plan tier with custom entitlement limits.
    """
    return await create_admin_plan(
        session=session,
        payload=payload,
        admin_user=admin_user,
    )


@router.patch(
    "/{plan_id}",
    response_model=AdminPlanDetail,
    status_code=status.HTTP_200_OK,
    summary="Update subscription plan pricing, limits & feature toggles",
)
async def update_admin_plan_endpoint(
    plan_id: UUID,
    payload: AdminPlanUpdateRequest,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminPlanDetail:
    """
    Updates subscription plan details and entitlement gates.
    """
    return await update_admin_plan(
        session=session,
        plan_id=plan_id,
        payload=payload,
        admin_user=admin_user,
    )


@router.delete(
    "/{plan_id}",
    response_model=AdminPlanDetail,
    status_code=status.HTTP_200_OK,
    summary="Archive/deactivate a subscription plan tier",
)
async def archive_admin_plan_endpoint(
    plan_id: UUID,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminPlanDetail:
    """
    Soft-archives a subscription plan (sets is_active=False and is_public=False).
    """
    return await archive_admin_plan(
        session=session,
        plan_id=plan_id,
        admin_user=admin_user,
    )
