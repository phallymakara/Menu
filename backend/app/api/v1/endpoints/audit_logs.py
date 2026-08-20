from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import PermissionDeniedError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.audit_log import AuditLogPaginationResponse
from app.services.audit_service import list_tenant_audit_logs

logger = structlog.get_logger("app.api.v1.endpoints.audit_logs")

router = APIRouter(
    prefix="/organizations/{org_id}/audit-logs",
    tags=["Audit Logs"],
)


@router.get(
    "",
    response_model=AuditLogPaginationResponse,
    status_code=status.HTTP_200_OK,
)
async def get_audit_logs(
    org_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    action: str | None = Query(default=None, description="Filter by audit action"),
    resource_type: str | None = Query(
        default=None, description="Filter by resource type"
    ),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(
        default=50, ge=1, le=100, description="Number of items per page"
    ),
) -> AuditLogPaginationResponse:
    """
    Retrieve paginated audit logs for a tenant organization.

    Restricted to organization Owners and Managers for compliance auditing.
    """
    try:
        return await list_tenant_audit_logs(
            session=session,
            tenant=tenant,
            org_id=org_id,
            action=action,
            resource_type=resource_type,
            page=page,
            page_size=page_size,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
