from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import (
    EntitlementLimitExceededError,
    ResourceConflictError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.branch import BranchCreate, BranchResponse, BranchUpdate
from app.services.branch_service import (
    create_branch,
    delete_branch,
    get_branch,
    list_branches,
    update_branch,
)

logger = structlog.get_logger("app.api.v1.endpoints.branches")

router = APIRouter(
    prefix="/businesses/{business_id}/branches",
    tags=["Branches"],
)


@router.post(
    "",
    response_model=BranchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_tenant_branch(
    business_id: UUID,
    payload: BranchCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchResponse:
    """
    Create a new branch for a business under the active tenant organization.
    """
    try:
        branch = await create_branch(
            session=session,
            tenant=tenant,
            business_id=business_id,
            payload=payload,
        )
        return BranchResponse.model_validate(branch)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ResourceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except EntitlementLimitExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.get(
    "",
    response_model=list[BranchResponse],
)
async def list_tenant_branches(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    is_active: Annotated[
        bool | None, Query(description="Filter by active status")
    ] = None,
) -> list[BranchResponse]:
    """
    List all branches belonging to a tenant business.
    """
    try:
        branches = await list_branches(
            session=session,
            tenant=tenant,
            business_id=business_id,
            is_active=is_active,
        )
        return [BranchResponse.model_validate(b) for b in branches]
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/{branch_id}",
    response_model=BranchResponse,
)
async def get_tenant_branch(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchResponse:
    """
    Get details of a specific branch belonging to a tenant business.
    """
    try:
        branch = await get_branch(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
        )
        return BranchResponse.model_validate(branch)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{branch_id}",
    response_model=BranchResponse,
)
async def update_tenant_branch(
    business_id: UUID,
    branch_id: UUID,
    payload: BranchUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchResponse:
    """
    Update branch profile and operational settings (language, currency,
    operating hours, active status).
    """
    try:
        branch = await update_branch(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            payload=payload,
        )
        return BranchResponse.model_validate(branch)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ResourceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{branch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_tenant_branch(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Delete a branch belonging to a tenant business.
    """
    try:
        await delete_branch(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
