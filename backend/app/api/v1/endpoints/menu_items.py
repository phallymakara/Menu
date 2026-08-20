from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.menu_item import (
    MenuItemCreate,
    MenuItemPaginationResponse,
    MenuItemResponse,
    MenuItemUpdate,
)
from app.services.menu_item_service import (
    create_menu_item,
    delete_menu_item,
    get_menu_item,
    list_menu_items,
    update_menu_item,
)

logger = structlog.get_logger("app.api.v1.endpoints.menu_items")

router = APIRouter(
    prefix="/businesses/{business_id}/items",
    tags=["Menu Items"],
)


@router.post(
    "",
    response_model=MenuItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_business_menu_item(
    business_id: UUID,
    payload: MenuItemCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MenuItemResponse:
    """
    Create a new menu item in the business catalog.
    """
    try:
        item = await create_menu_item(
            session=session,
            tenant=tenant,
            business_id=business_id,
            payload=payload,
        )
        return MenuItemResponse.model_validate(item)
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
    response_model=MenuItemPaginationResponse,
    status_code=status.HTTP_200_OK,
)
async def list_business_menu_items(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    category_id: Annotated[
        UUID | None, Query(description="Filter by Category ID")
    ] = None,
    is_active: Annotated[
        bool | None, Query(description="Filter by active status")
    ] = None,
    is_featured: Annotated[
        bool | None, Query(description="Filter featured items")
    ] = None,
    is_popular: Annotated[
        bool | None, Query(description="Filter popular items")
    ] = None,
    is_new: Annotated[bool | None, Query(description="Filter new items")] = None,
    is_vegetarian: Annotated[
        bool | None, Query(description="Vegetarian filter")
    ] = None,
    is_vegan: Annotated[bool | None, Query(description="Vegan filter")] = None,
    is_halal: Annotated[bool | None, Query(description="Halal filter")] = None,
    is_gluten_free: Annotated[
        bool | None, Query(description="Gluten-free filter")
    ] = None,
    spice_level: Annotated[
        int | None, Query(ge=0, le=3, description="Spice level")
    ] = None,
    search: Annotated[
        str | None, Query(description="Search keyword in names/SKU")
    ] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> MenuItemPaginationResponse:
    """
    List and search menu items with dietary, category, and feature filters.
    """
    try:
        return await list_menu_items(
            session=session,
            tenant=tenant,
            business_id=business_id,
            category_id=category_id,
            is_active=is_active,
            is_featured=is_featured,
            is_popular=is_popular,
            is_new=is_new,
            is_vegetarian=is_vegetarian,
            is_vegan=is_vegan,
            is_halal=is_halal,
            is_gluten_free=is_gluten_free,
            spice_level=spice_level,
            search=search,
            page=page,
            page_size=page_size,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/{item_id}",
    response_model=MenuItemResponse,
    status_code=status.HTTP_200_OK,
)
async def get_business_menu_item(
    business_id: UUID,
    item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MenuItemResponse:
    """
    Get a single menu item by ID.
    """
    try:
        item = await get_menu_item(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
        )
        return MenuItemResponse.model_validate(item)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{item_id}",
    response_model=MenuItemResponse,
    status_code=status.HTTP_200_OK,
)
async def update_business_menu_item(
    business_id: UUID,
    item_id: UUID,
    payload: MenuItemUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MenuItemResponse:
    """
    Partially update a menu item.
    """
    try:
        item = await update_menu_item(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
            payload=payload,
        )
        return MenuItemResponse.model_validate(item)
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
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_business_menu_item(
    business_id: UUID,
    item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Delete a menu item.
    """
    try:
        await delete_menu_item(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
