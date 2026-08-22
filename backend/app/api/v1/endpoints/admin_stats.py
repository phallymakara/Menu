from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.admin import get_current_platform_admin
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.admin_stats import PlatformKPIResponse
from app.services.admin_service import get_platform_kpi_stats

logger = structlog.get_logger("app.api.v1.endpoints.admin_stats")

router = APIRouter(
    prefix="/admin/stats",
    tags=["Platform Super Admin"],
)


@router.get(
    "",
    response_model=PlatformKPIResponse,
    status_code=status.HTTP_200_OK,
    summary="Get platform-wide Super Admin KPI dashboard & SaaS economics",
)
async def get_platform_kpi_stats_endpoint(
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlatformKPIResponse:
    """
    Computes and returns global platform metrics including total organizations,
    infrastructure scale counters, live active dining sessions, SaaS subscription
    MRR/ARR, tenant growth, and subscription tier distributions.

    Requires Super Admin privileges (is_platform_admin=True).
    """
    logger.info(
        "Super Admin accessed platform KPI stats",
        admin_user_id=str(admin_user.id),
        admin_email=admin_user.email,
    )
    return await get_platform_kpi_stats(session=session)
