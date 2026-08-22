from __future__ import annotations

import math
from datetime import datetime
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.organization import Organization
from app.models.user import User
from app.schemas.admin_audit_log import AdminAuditLogItem, AdminAuditLogListResponse

logger = structlog.get_logger("app.services.admin_audit_service")


# ==============================================================================
# 1. CROSS-TENANT AUDIT LOG QUERY ENGINE
# ==============================================================================


async def list_admin_audit_logs(
    session: AsyncSession,
    organization_id: UUID | None = None,
    user_id: UUID | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = 1,
    page_size: int = 50,
) -> AdminAuditLogListResponse:
    """
    Returns paginated platform-wide audit logs with rich filters and joined entity metadata.
    """
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 50
    if page_size > 100:
        page_size = 100

    offset = (page - 1) * page_size

    # Base query with outer joins on Organization and User
    base_query = (
        select(
            AuditLog,
            Organization.name.label("organization_name"),
            Organization.slug.label("organization_slug"),
            User.full_name.label("user_name"),
            User.email.label("user_email"),
        )
        .outerjoin(Organization, AuditLog.organization_id == Organization.id)
        .outerjoin(User, AuditLog.user_id == User.id)
        .order_by(AuditLog.created_at.desc())
    )

    # 1. Filter by Organization
    if organization_id:
        base_query = base_query.where(AuditLog.organization_id == organization_id)

    # 2. Filter by User
    if user_id:
        base_query = base_query.where(AuditLog.user_id == user_id)

    # 3. Filter by Action
    if action:
        if action.endswith("*"):
            prefix = action[:-1]
            base_query = base_query.where(AuditLog.action.startswith(prefix))
        else:
            base_query = base_query.where(AuditLog.action == action)

    # 4. Filter by Resource Type
    if resource_type:
        base_query = base_query.where(AuditLog.resource_type == resource_type)

    # 5. Filter by Date Range
    if from_date:
        base_query = base_query.where(AuditLog.created_at >= from_date)
    if to_date:
        base_query = base_query.where(AuditLog.created_at <= to_date)

    # Count matching records
    count_subquery = (
        select(AuditLog.id)
        .outerjoin(Organization, AuditLog.organization_id == Organization.id)
        .outerjoin(User, AuditLog.user_id == User.id)
    )
    if organization_id:
        count_subquery = count_subquery.where(AuditLog.organization_id == organization_id)
    if user_id:
        count_subquery = count_subquery.where(AuditLog.user_id == user_id)
    if action:
        if action.endswith("*"):
            prefix = action[:-1]
            count_subquery = count_subquery.where(AuditLog.action.startswith(prefix))
        else:
            count_subquery = count_subquery.where(AuditLog.action == action)
    if resource_type:
        count_subquery = count_subquery.where(AuditLog.resource_type == resource_type)
    if from_date:
        count_subquery = count_subquery.where(AuditLog.created_at >= from_date)
    if to_date:
        count_subquery = count_subquery.where(AuditLog.created_at <= to_date)

    total_res = await session.execute(
        select(func.count()).select_from(count_subquery.subquery())
    )
    total = total_res.scalar_one() or 0

    # Paginate and execute
    paged_query = base_query.offset(offset).limit(page_size)
    res = await session.execute(paged_query)
    rows = res.all()

    items: list[AdminAuditLogItem] = []
    for log, org_name, org_slug, u_name, u_email in rows:
        items.append(
            AdminAuditLogItem(
                id=log.id,
                organization_id=log.organization_id,
                organization_name=org_name,
                organization_slug=org_slug,
                user_id=log.user_id,
                user_name=u_name,
                user_email=u_email,
                action=log.action,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                details=log.details or {},
                created_at=log.created_at,
            )
        )

    total_pages = math.ceil(total / page_size) if total > 0 else 1

    return AdminAuditLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ==============================================================================
# 2. AUDIT LOG DEEP RECORD INSPECTION
# ==============================================================================


async def get_admin_audit_log_detail(
    session: AsyncSession,
    log_id: UUID,
) -> AdminAuditLogItem:
    """
    Retrieves full details of a specific audit log record with joined entity metadata.
    """
    query = (
        select(
            AuditLog,
            Organization.name.label("organization_name"),
            Organization.slug.label("organization_slug"),
            User.full_name.label("user_name"),
            User.email.label("user_email"),
        )
        .outerjoin(Organization, AuditLog.organization_id == Organization.id)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(AuditLog.id == log_id)
    )
    res = await session.execute(query)
    row = res.first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit log record not found.",
        )

    log, org_name, org_slug, u_name, u_email = row

    return AdminAuditLogItem(
        id=log.id,
        organization_id=log.organization_id,
        organization_name=org_name,
        organization_slug=org_slug,
        user_id=log.user_id,
        user_name=u_name,
        user_email=u_email,
        action=log.action,
        resource_type=log.resource_type,
        resource_id=log.resource_id,
        ip_address=log.ip_address,
        user_agent=log.user_agent,
        details=log.details or {},
        created_at=log.created_at,
    )
