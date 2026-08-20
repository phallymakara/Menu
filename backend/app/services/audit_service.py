from math import ceil
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PermissionDeniedError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.audit_log import AuditLog
from app.models.enums import MembershipStatus, StaffRole
from app.models.organization_membership import OrganizationMembership
from app.schemas.audit_log import AuditLogPaginationResponse, AuditLogResponse

logger = structlog.get_logger("app.services.audit_service")


async def record_audit_log(
    session: AsyncSession,
    action: str,
    organization_id: UUID | None = None,
    user_id: UUID | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    """
    Creates an immutable audit log record for security and regulatory compliance.
    """
    audit = AuditLog(
        organization_id=organization_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details or {},
    )
    session.add(audit)
    await session.flush()

    logger.info(
        "Audit log recorded",
        action=action,
        organization_id=str(organization_id) if organization_id else None,
        user_id=str(user_id) if user_id else None,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
    )
    return audit


async def list_tenant_audit_logs(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
    action: str | None = None,
    resource_type: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> AuditLogPaginationResponse:
    """
    Lists paginated audit logs for the specified tenant organization.

    Restricted to organization Owners and Managers.
    """
    if tenant.organization_id != org_id:
        raise TenantNotFoundError("Organization not found.")

    # Caller must be owner or manager
    mem_res = await session.execute(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.user_id == tenant.user_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
        )
    )
    caller = mem_res.scalar_one_or_none()
    if caller is None or (
        not caller.is_owner and caller.role not in (StaffRole.OWNER, StaffRole.MANAGER)
    ):
        raise PermissionDeniedError(
            "Only organization owners and managers can view audit logs."
        )

    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base_query = select(AuditLog).where(AuditLog.organization_id == org_id)

    if action:
        base_query = base_query.where(AuditLog.action == action)
    if resource_type:
        base_query = base_query.where(AuditLog.resource_type == resource_type)

    # Count total
    count_query = select(func.count()).select_from(base_query.subquery())
    total_res = await session.execute(count_query)
    total = total_res.scalar_one()

    # Paginate
    offset = (page - 1) * page_size
    items_query = (
        base_query.order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    )
    items_res = await session.execute(items_query)
    items = items_res.scalars().all()

    total_pages = ceil(total / page_size) if total > 0 else 1

    return AuditLogPaginationResponse(
        items=[AuditLogResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
