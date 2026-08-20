from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.branch_menu import (
    BranchCategoryAssignmentRequest,
    BranchItemOverrideCreate,
    BranchItemOverrideResponse,
    BranchMenuCatalogResponse,
    BulkBranchItemOverrideRequest,
)
from app.services.branch_menu_service import (
    assign_categories_to_branch,
    bulk_set_branch_item_overrides,
    delete_branch_item_override,
    get_branch_published_menu,
    set_branch_item_override,
)

logger = structlog.get_logger("app.api.v1.endpoints.branch_menu")

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/menu",
    tags=["Multi-Branch Menu Publishing & Overrides"],
)


@router.post(
    "/overrides/bulk",
    response_model=list[BranchItemOverrideResponse],
    status_code=status.HTTP_200_OK,
)
async def bulk_set_branch_item_overrides_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: BulkBranchItemOverrideRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[BranchItemOverrideResponse]:
    """
    Bulk update price or stock status overrides across multiple items at a branch.
    """
    try:
        return await bulk_set_branch_item_overrides(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/overrides/{item_id}",
    response_model=BranchItemOverrideResponse,
    status_code=status.HTTP_200_OK,
)
async def set_branch_item_override_endpoint(
    business_id: UUID,
    branch_id: UUID,
    item_id: UUID,
    payload: BranchItemOverrideCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchItemOverrideResponse:
    """
    Set or update price and availability overrides for a specific branch menu item.
    """
    try:
        return await set_branch_item_override(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            item_id=item_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete(
    "/overrides/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_branch_item_override_endpoint(
    business_id: UUID,
    branch_id: UUID,
    item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Reset a branch menu item override back to master catalog defaults.
    """
    try:
        await delete_branch_item_override(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            item_id=item_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/categories",
    response_model=list[UUID],
    status_code=status.HTTP_200_OK,
)
async def assign_categories_to_branch_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: BranchCategoryAssignmentRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[UUID]:
    """
    Selectively publish categories to a branch.
    """
    try:
        return await assign_categories_to_branch(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/published",
    response_model=BranchMenuCatalogResponse,
    status_code=status.HTTP_200_OK,
)
async def get_branch_published_menu_endpoint(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    include_hidden: Annotated[
        bool,
        Query(description="Include hidden/omitted menu items"),
    ] = False,
) -> BranchMenuCatalogResponse:
    """
    Retrieve live resolved menu catalog for a branch.
    """
    try:
        return await get_branch_published_menu(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            include_hidden=include_hidden,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
