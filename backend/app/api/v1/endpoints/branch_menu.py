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


# ---------------------------------------------------------------------------
# Branch-Specific Local Menu Items & Add-ons
# ---------------------------------------------------------------------------

from app.schemas.catalog_sync import (
    BranchLocalItemCreate,
    ResetBranchOverridesRequest,
)
from app.schemas.menu_item import MenuItemResponse
from app.services.branch_menu_service import (
    create_branch_local_item,
    promote_local_item_to_master,
    reset_branch_overrides_to_master,
)


@router.post(
    "/local-items",
    response_model=MenuItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a local-only menu item or add-on for this branch",
)
async def create_branch_local_item_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: BranchLocalItemCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MenuItemResponse:
    """
    Creates a new branch-specific local item/add-on that only appears in this branch.
    """
    try:
        item = await create_branch_local_item(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            payload=payload,
        )
        return MenuItemResponse.model_validate(item)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/local-items/{item_id}/promote",
    response_model=MenuItemResponse,
    status_code=status.HTTP_200_OK,
    summary="Promote a local branch item to the Central Master Catalog",
)
async def promote_local_item_endpoint(
    business_id: UUID,
    branch_id: UUID,
    item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MenuItemResponse:
    """
    Converts a local branch item into a Central Master Brand Item (branch_id=None).
    """
    try:
        item = await promote_local_item_to_master(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            item_id=item_id,
        )
        return MenuItemResponse.model_validate(item)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/reset-to-master",
    status_code=status.HTTP_200_OK,
    summary="Reset branch overrides back to Central Master defaults",
)
async def reset_branch_overrides_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: ResetBranchOverridesRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict:
    """
    Clears price and availability overrides for this branch.
    """
    try:
        reset_count = await reset_branch_overrides_to_master(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            payload=payload,
        )
        return {"message": f"Successfully reset {reset_count} overrides to master defaults.", "reset_count": reset_count}
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

