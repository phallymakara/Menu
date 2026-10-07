"""Staff endpoints for the POS service hub: the branch's guest service request queue."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.permissions import (
    Permission,
    require_permission_for_writes,
)
from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import (
    PermissionDeniedError,
    ResourceConflictError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.enums import ServiceRequestStatus
from app.schemas.service_request import ServiceRequestResponse
from app.services.service_request_service import (
    acknowledge_service_request,
    list_branch_service_requests,
    resolve_service_request,
)

# Any active member may view the queue; acknowledging or resolving needs SERVE_TABLES.
router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/service-requests",
    tags=["Service Hub (Guest Service Requests)"],
    dependencies=[Depends(require_permission_for_writes(Permission.SERVE_TABLES))],
)


def _to_http_error(
    exc: TenantNotFoundError | PermissionDeniedError | ResourceConflictError,
) -> HTTPException:
    """Translates a service-layer domain exception into its HTTP response."""
    if isinstance(exc, TenantNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, PermissionDeniedError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.get(
    "",
    response_model=list[ServiceRequestResponse],
    status_code=status.HTTP_200_OK,
    summary="List the branch's guest service requests",
)
async def list_service_requests_endpoint(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    status_filter: Annotated[
        list[ServiceRequestStatus] | None,
        Query(
            alias="status",
            description=(
                "Statuses to include; repeat the parameter for several. "
                "Defaults to the open and acknowledged requests."
            ),
        ),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[ServiceRequestResponse]:
    """Lists the branch's service requests, newest first."""
    try:
        return await list_branch_service_requests(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            statuses=status_filter,
            limit=limit,
        )
    except (TenantNotFoundError, PermissionDeniedError) as exc:
        raise _to_http_error(exc) from exc


@router.post(
    "/{request_id}/acknowledge",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_200_OK,
    summary="Take an open guest service request",
)
async def acknowledge_service_request_endpoint(
    business_id: UUID,
    branch_id: UUID,
    request_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ServiceRequestResponse:
    """Marks an open request as acknowledged by the caller; 409 if it is not open."""
    try:
        return await acknowledge_service_request(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            request_id=request_id,
        )
    except (
        TenantNotFoundError,
        PermissionDeniedError,
        ResourceConflictError,
    ) as exc:
        raise _to_http_error(exc) from exc


@router.post(
    "/{request_id}/resolve",
    response_model=ServiceRequestResponse,
    status_code=status.HTTP_200_OK,
    summary="Mark a guest service request as handled",
)
async def resolve_service_request_endpoint(
    business_id: UUID,
    branch_id: UUID,
    request_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ServiceRequestResponse:
    """Marks an open or acknowledged request as resolved; 409 if it is already closed."""
    try:
        return await resolve_service_request(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            request_id=request_id,
        )
    except (
        TenantNotFoundError,
        PermissionDeniedError,
        ResourceConflictError,
    ) as exc:
        raise _to_http_error(exc) from exc
