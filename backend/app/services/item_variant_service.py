from uuid import UUID

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.item_variant import ItemVariant
from app.models.menu_item import MenuItem
from app.schemas.item_variant import (
    ItemVariantBatchCreate,
    ItemVariantCreate,
    ItemVariantUpdate,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.item_variant_service")


async def _verify_menu_item_access(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
) -> MenuItem:
    """Helper to verify menu item exists and belongs to active tenant and business."""
    result = await session.execute(
        select(MenuItem).where(
            MenuItem.id == item_id,
            MenuItem.business_id == business_id,
            MenuItem.organization_id == tenant.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise TenantNotFoundError("Menu item not found.")
    return item


async def create_variant(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    payload: ItemVariantCreate,
) -> ItemVariant:
    """
    Creates a new variant (size, temperature, portion) for a menu item.
    """
    await _verify_menu_item_access(session, tenant, business_id, item_id)

    # If new variant is default, unset other defaults in the same group
    if payload.is_default:
        await session.execute(
            update(ItemVariant)
            .where(
                ItemVariant.menu_item_id == item_id,
                ItemVariant.variant_group == payload.variant_group,
            )
            .values(is_default=False)
        )

    variant_data = payload.model_dump()
    variant = ItemVariant(
        organization_id=tenant.organization_id,
        business_id=business_id,
        menu_item_id=item_id,
        **variant_data,
    )
    session.add(variant)
    await session.commit()
    await session.refresh(variant)

    await record_audit_log(
        session=session,
        action="VARIANT_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="item_variant",
        resource_id=str(variant.id),
        details={
            "name_en": variant.name_en,
            "group": variant.variant_group,
            "adjustment": str(variant.price_adjustment),
        },
    )
    await session.commit()

    logger.info(
        "Item variant created",
        variant_id=str(variant.id),
        item_id=str(item_id),
        name_en=variant.name_en,
    )
    return variant


async def create_batch_variants(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    payload: ItemVariantBatchCreate,
) -> list[ItemVariant]:
    """
    Batch creates multiple variants for a menu item.
    """
    await _verify_menu_item_access(session, tenant, business_id, item_id)

    created_variants = []
    for var_in in payload.variants:
        if var_in.is_default:
            await session.execute(
                update(ItemVariant)
                .where(
                    ItemVariant.menu_item_id == item_id,
                    ItemVariant.variant_group == var_in.variant_group,
                )
                .values(is_default=False)
            )

        variant = ItemVariant(
            organization_id=tenant.organization_id,
            business_id=business_id,
            menu_item_id=item_id,
            **var_in.model_dump(),
        )
        session.add(variant)
        created_variants.append(variant)

    await session.commit()
    for v in created_variants:
        await session.refresh(v)

    await record_audit_log(
        session=session,
        action="VARIANT_BATCH_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="menu_item",
        resource_id=str(item_id),
        details={"count": len(created_variants)},
    )
    await session.commit()

    return created_variants


async def list_variants(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
) -> list[ItemVariant]:
    """
    Retrieves all variants for a menu item.
    """
    await _verify_menu_item_access(session, tenant, business_id, item_id)

    result = await session.execute(
        select(ItemVariant)
        .where(
            ItemVariant.menu_item_id == item_id,
            ItemVariant.business_id == business_id,
            ItemVariant.organization_id == tenant.organization_id,
        )
        .order_by(ItemVariant.variant_group.asc(), ItemVariant.display_order.asc())
    )
    return list(result.scalars().all())


async def get_variant(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    variant_id: UUID,
) -> ItemVariant:
    """
    Retrieves a single variant by ID.
    """
    result = await session.execute(
        select(ItemVariant).where(
            ItemVariant.id == variant_id,
            ItemVariant.menu_item_id == item_id,
            ItemVariant.business_id == business_id,
            ItemVariant.organization_id == tenant.organization_id,
        )
    )
    variant = result.scalar_one_or_none()
    if variant is None:
        raise TenantNotFoundError("Item variant not found.")
    return variant


async def update_variant(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    variant_id: UUID,
    payload: ItemVariantUpdate,
) -> ItemVariant:
    """
    Partially updates an item variant.
    """
    variant = await get_variant(session, tenant, business_id, item_id, variant_id)

    update_data = payload.model_dump(exclude_unset=True)

    target_group = update_data.get("variant_group", variant.variant_group)
    if update_data.get("is_default") is True:
        await session.execute(
            update(ItemVariant)
            .where(
                ItemVariant.menu_item_id == item_id,
                ItemVariant.variant_group == target_group,
                ItemVariant.id != variant_id,
            )
            .values(is_default=False)
        )

    for field, value in update_data.items():
        setattr(variant, field, value)

    await session.commit()
    await session.refresh(variant)

    await record_audit_log(
        session=session,
        action="VARIANT_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="item_variant",
        resource_id=str(variant_id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info("Item variant updated", variant_id=str(variant_id))
    return variant


async def delete_variant(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    variant_id: UUID,
) -> None:
    """
    Deletes an item variant.
    """
    variant = await get_variant(session, tenant, business_id, item_id, variant_id)

    await session.delete(variant)
    await session.commit()

    await record_audit_log(
        session=session,
        action="VARIANT_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="item_variant",
        resource_id=str(variant_id),
    )
    await session.commit()

    logger.info("Item variant deleted", variant_id=str(variant_id))
