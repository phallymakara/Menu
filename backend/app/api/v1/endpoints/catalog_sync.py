from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.catalog_sync import (
    CatalogComparisonResponse,
    CatalogSyncResult,
    MasterCatalogSyncRequest,
)
from app.services.branch_menu_service import (
    get_catalog_comparison_matrix,
    sync_master_catalog_to_branches,
)

router = APIRouter(
    prefix="/businesses/{business_id}/catalog",
    tags=["Central Brand Catalog & Multi-Branch Sync"],
)


@router.post(
    "/sync-branches",
    response_model=CatalogSyncResult,
    status_code=status.HTTP_200_OK,
    summary="HQ pushes master catalog updates across all or selected branches",
)
async def sync_master_catalog_endpoint(
    business_id: UUID,
    payload: MasterCatalogSyncRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CatalogSyncResult:
    """
    Synchronizes the Central Master Catalog with target branches, with option
    to preserve existing branch localized price overrides or force master prices.
    """
    try:
        return await sync_master_catalog_to_branches(
            session=session,
            tenant=tenant,
            business_id=business_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/comparison",
    response_model=CatalogComparisonResponse,
    status_code=status.HTTP_200_OK,
    summary="Multi-branch catalog comparison matrix (Master vs Branch prices & local add-ons)",
)
async def get_catalog_comparison_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CatalogComparisonResponse:
    """
    Provides HQ with an analytical matrix comparing master catalog items against
    each branch's localized pricing, availability overrides, and local add-ons.
    """
    try:
        return await get_catalog_comparison_matrix(
            session=session,
            tenant=tenant,
            business_id=business_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
