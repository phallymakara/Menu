"""Menu item recipe (bill of materials) endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.menu_item_recipe import (
    MenuItemRecipeReplaceRequest,
    MenuItemRecipeResponse,
)
from app.services.menu_item_recipe_service import (
    get_menu_item_recipe,
    replace_menu_item_recipe,
)

router = APIRouter(
    prefix="/businesses/{business_id}/items/{item_id}/recipe",
    tags=["Menu Item Recipes (BOM)"],
)


@router.get(
    "",
    response_model=MenuItemRecipeResponse,
    status_code=status.HTTP_200_OK,
    summary="Get the recipe (bill of materials) of a menu item",
)
async def get_menu_item_recipe_endpoint(
    business_id: UUID,
    item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MenuItemRecipeResponse:
    """Returns the ingredient lines consumed from branch stock per unit sold."""
    try:
        return await get_menu_item_recipe(
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


@router.put(
    "",
    response_model=MenuItemRecipeResponse,
    status_code=status.HTTP_200_OK,
    summary="Replace the whole recipe of a menu item",
)
async def replace_menu_item_recipe_endpoint(
    business_id: UUID,
    item_id: UUID,
    payload: MenuItemRecipeReplaceRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MenuItemRecipeResponse:
    """
    Atomically replaces every recipe line of the menu item; an empty list clears it.
    Quantities are per unit sold, in each inventory item's own unit of measure.
    """
    try:
        return await replace_menu_item_recipe(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
            payload=payload,
        )
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
