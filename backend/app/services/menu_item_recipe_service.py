"""Menu item recipe (bill of materials) management."""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from uuid import UUID

import structlog
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.business import Business
from app.models.inventory import InventoryItem
from app.models.item_variant import ItemVariant
from app.models.menu_item import MenuItem
from app.models.menu_item_recipe import MenuItemRecipe
from app.schemas.menu_item_recipe import (
    MenuItemRecipeReplaceRequest,
    MenuItemRecipeResponse,
    RecipeLineResponse,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.menu_item_recipe_service")

# Branch stock and stock logs store 2 decimal places; recipe quantities match.
QUANTITY_STEP = Decimal("0.01")


async def _verify_menu_item_access(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    *,
    lock: bool = False,
) -> None:
    """
    Verifies that the business and the menu item belong to the active tenant.

    With ``lock`` the menu item row is locked (``SELECT ... FOR UPDATE``) so that
    concurrent recipe replacements for the same item are serialized.
    Raises ``TenantNotFoundError`` when either is missing or foreign.
    """
    business_res = await session.execute(
        select(Business.id).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    if business_res.scalar_one_or_none() is None:
        raise TenantNotFoundError("Business not found.")

    item_stmt = select(MenuItem.id).where(
        MenuItem.id == item_id,
        MenuItem.business_id == business_id,
        MenuItem.organization_id == tenant.organization_id,
    )
    if lock:
        item_stmt = item_stmt.with_for_update()
    item_res = await session.execute(item_stmt)
    if item_res.scalar_one_or_none() is None:
        raise TenantNotFoundError("Menu item not found.")


async def _verify_line_references(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    payload: MenuItemRecipeReplaceRequest,
) -> None:
    """
    Verifies every inventory item and variant referenced by the recipe lines.

    Inventory items must belong to the tenant and the business; variants must
    also belong to the menu item. Raises ``TenantNotFoundError`` otherwise.
    """
    inventory_ids = {line.inventory_item_id for line in payload.lines}
    if inventory_ids:
        found_res = await session.execute(
            select(InventoryItem.id).where(
                InventoryItem.id.in_(inventory_ids),
                InventoryItem.business_id == business_id,
                InventoryItem.organization_id == tenant.organization_id,
            )
        )
        if set(found_res.scalars().all()) != inventory_ids:
            raise TenantNotFoundError("Inventory item not found.")

    variant_ids = {
        line.variant_id for line in payload.lines if line.variant_id is not None
    }
    if variant_ids:
        found_res = await session.execute(
            select(ItemVariant.id).where(
                ItemVariant.id.in_(variant_ids),
                ItemVariant.menu_item_id == item_id,
                ItemVariant.business_id == business_id,
                ItemVariant.organization_id == tenant.organization_id,
            )
        )
        if set(found_res.scalars().all()) != variant_ids:
            raise TenantNotFoundError("Item variant not found.")


async def _load_recipe_lines(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
) -> Sequence[MenuItemRecipe]:
    """Loads a menu item's recipe lines, all-variants lines first."""
    result = await session.execute(
        select(MenuItemRecipe)
        .join(InventoryItem, InventoryItem.id == MenuItemRecipe.inventory_item_id)
        .where(
            MenuItemRecipe.menu_item_id == item_id,
            MenuItemRecipe.business_id == business_id,
            MenuItemRecipe.organization_id == tenant.organization_id,
        )
        .order_by(
            MenuItemRecipe.variant_id.is_not(None),
            MenuItemRecipe.variant_id,
            InventoryItem.name_en,
            MenuItemRecipe.id,
        )
        .execution_options(populate_existing=True)
    )
    return result.scalars().all()


def _build_recipe_response(
    business_id: UUID,
    item_id: UUID,
    lines: Sequence[MenuItemRecipe],
) -> MenuItemRecipeResponse:
    """Maps recipe line entities to the API response."""
    return MenuItemRecipeResponse(
        menu_item_id=item_id,
        business_id=business_id,
        lines=[
            RecipeLineResponse(
                id=line.id,
                inventory_item_id=line.inventory_item_id,
                inventory_item_name_en=line.inventory_item.name_en,
                inventory_item_name_km=line.inventory_item.name_km,
                unit_of_measure=line.inventory_item.unit_of_measure,
                variant_id=line.variant_id,
                variant_name_en=line.variant.name_en if line.variant else None,
                quantity=line.quantity,
                cost_per_unit_usd=line.inventory_item.cost_per_unit_usd,
                created_at=line.created_at,
                updated_at=line.updated_at,
            )
            for line in lines
        ],
    )


async def get_menu_item_recipe(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
) -> MenuItemRecipeResponse:
    """
    Returns the recipe (bill of materials) of a menu item.

    Raises ``TenantNotFoundError`` when the business or the menu item does not
    belong to the active tenant.
    """
    await _verify_menu_item_access(session, tenant, business_id, item_id)
    lines = await _load_recipe_lines(session, tenant, business_id, item_id)
    return _build_recipe_response(business_id, item_id, lines)


async def replace_menu_item_recipe(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    payload: MenuItemRecipeReplaceRequest,
) -> MenuItemRecipeResponse:
    """
    Replaces the whole recipe of a menu item in one transaction.

    Every existing line is deleted and the payload lines are inserted; an empty
    payload clears the recipe. The business, the menu item, every inventory item
    and every variant must belong to the active tenant and the business, else
    ``TenantNotFoundError`` is raised. A concurrent conflicting write raises
    ``ResourceConflictError``.
    """
    await _verify_menu_item_access(session, tenant, business_id, item_id, lock=True)
    await _verify_line_references(session, tenant, business_id, item_id, payload)

    await session.execute(
        delete(MenuItemRecipe).where(
            MenuItemRecipe.menu_item_id == item_id,
            MenuItemRecipe.organization_id == tenant.organization_id,
        )
    )
    session.add_all(
        [
            MenuItemRecipe(
                organization_id=tenant.organization_id,
                business_id=business_id,
                menu_item_id=item_id,
                variant_id=line.variant_id,
                inventory_item_id=line.inventory_item_id,
                quantity=line.quantity.quantize(QUANTITY_STEP),
            )
            for line in payload.lines
        ]
    )

    try:
        await record_audit_log(
            session=session,
            action="MENU_ITEM_RECIPE_REPLACED",
            organization_id=tenant.organization_id,
            user_id=tenant.user_id,
            resource_type="menu_item",
            resource_id=str(item_id),
            details={"line_count": len(payload.lines)},
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        logger.warning(
            "Menu item recipe replacement conflicted",
            organization_id=str(tenant.organization_id),
            menu_item_id=str(item_id),
        )
        raise ResourceConflictError(
            "The recipe was changed by another request. Reload it and try again."
        ) from exc

    logger.info(
        "Menu item recipe replaced",
        organization_id=str(tenant.organization_id),
        business_id=str(business_id),
        menu_item_id=str(item_id),
        line_count=len(payload.lines),
    )
    lines = await _load_recipe_lines(session, tenant, business_id, item_id)
    return _build_recipe_response(business_id, item_id, lines)
