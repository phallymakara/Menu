from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.admin import get_current_platform_admin
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.admin_audit_log import AdminAuditLogItem, AdminAuditLogListResponse
from app.services.admin_audit_service import (
    get_admin_audit_log_detail,
    list_admin_audit_logs,
)

logger = structlog.get_logger("app.api.v1.endpoints.admin_audit_logs")

router = APIRouter(
    prefix="/admin/audit-logs",
    tags=["Platform Super Admin — Audit Trail"],
)


@router.get(
    "",
    response_model=AdminAuditLogListResponse,
    status_code=status.HTTP_200_OK,
    summary="Query platform-wide cross-tenant audit logs",
)
async def list_admin_audit_logs_endpoint(
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    organization_id: Annotated[UUID | None, Query(description="Filter by organization ID")] = None,
    user_id: Annotated[UUID | None, Query(description="Filter by acting user ID")] = None,
    action: Annotated[str | None, Query(description="Filter by action identifier or wildcard prefix (e.g. admin.*)")] = None,
    resource_type: Annotated[str | None, Query(description="Filter by resource type")] = None,
    from_date: Annotated[datetime | None, Query(description="Filter from timestamp")] = None,
    to_date: Annotated[datetime | None, Query(description="Filter to timestamp")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> AdminAuditLogListResponse:
    """
    Returns paginated platform-wide audit logs with rich multi-field filters.
    Requires Super Admin privileges (is_platform_admin=True).
    """
    return await list_admin_audit_logs(
        session=session,
        organization_id=organization_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{log_id}",
    response_model=AdminAuditLogItem,
    status_code=status.HTTP_200_OK,
    summary="Inspect individual audit log record",
)
async def get_admin_audit_log_detail_endpoint(
    log_id: UUID,
    admin_user: Annotated[User, Depends(get_current_platform_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AdminAuditLogItem:
    """
    Deep inspection of a single audit log entry including joined organization and user details.
    """
    return await get_admin_audit_log_detail(session=session, log_id=log_id)
