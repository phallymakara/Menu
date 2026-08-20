from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.category import (
    CategoryCreate,
    CategoryReorderRequest,
    CategoryResponse,
    CategoryTreeResponse,
    CategoryUpdate,
)
from app.services.category_service import (
    create_category,
    delete_category,
    get_category,
    list_categories,
    reorder_categories,
    update_category,
)

logger = structlog.get_logger("app.api.v1.endpoints.categories")

router = APIRouter(
    prefix="/businesses/{business_id}/categories",
    tags=["Menu Categories"],
)


@router.post(
    "",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_business_category(
    business_id: UUID,
    payload: CategoryCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CategoryResponse:
    """
    Create a new menu category or subcategory for a business.
    """
    try:
        category = await create_category(
            session=session,
            tenant=tenant,
            business_id=business_id,
            payload=payload,
        )
        return CategoryResponse.model_validate(category)
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


@router.get(
    "",
    response_model=list[CategoryTreeResponse] | list[CategoryResponse],
    status_code=status.HTTP_200_OK,
)
async def list_business_categories(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    tree: Annotated[
        bool,
        Query(description="Return nested category tree with subcategories"),
    ] = False,
    is_active: Annotated[
        bool | None,
        Query(description="Filter by active visibility toggle"),
    ] = None,
) -> list[CategoryTreeResponse] | list[CategoryResponse]:
    """
    List categories for a business in flat or hierarchical tree format.
    """
    try:
        return await list_categories(
            session=session,
            tenant=tenant,
            business_id=business_id,
            is_active=is_active,
            tree=tree,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.put(
    "/reorder",
    response_model=list[CategoryResponse],
    status_code=status.HTTP_200_OK,
)
async def reorder_business_categories(
    business_id: UUID,
    payload: CategoryReorderRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[CategoryResponse]:
    """
    Batch update display order for menu categories.
    """
    try:
        return await reorder_categories(
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
    "/{category_id}",
    response_model=CategoryResponse,
    status_code=status.HTTP_200_OK,
)
async def get_business_category(
    business_id: UUID,
    category_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CategoryResponse:
    """
    Get category details by ID.
    """
    try:
        category = await get_category(
            session=session,
            tenant=tenant,
            business_id=business_id,
            category_id=category_id,
        )
        return CategoryResponse.model_validate(category)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{category_id}",
    response_model=CategoryResponse,
    status_code=status.HTTP_200_OK,
)
async def update_business_category(
    business_id: UUID,
    category_id: UUID,
    payload: CategoryUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CategoryResponse:
    """
    Partially update a menu category or subcategory.
    """
    try:
        category = await update_category(
            session=session,
            tenant=tenant,
            business_id=business_id,
            category_id=category_id,
            payload=payload,
        )
        return CategoryResponse.model_validate(category)
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
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_business_category(
    business_id: UUID,
    category_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Delete a category and its subcategories.
    """
    try:
        await delete_category(
            session=session,
            tenant=tenant,
            business_id=business_id,
            category_id=category_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
