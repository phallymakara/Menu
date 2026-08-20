from uuid import UUID

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.business import Business
from app.models.menu_item import MenuItem
from app.models.modifier import MenuItemModifierGroup, ModifierGroup, ModifierOption
from app.schemas.modifier import (
    AssignModifierGroupsRequest,
    ModifierGroupCreate,
    ModifierGroupDetailResponse,
    ModifierGroupUpdate,
    ModifierOptionCreate,
    ModifierOptionResponse,
    ModifierOptionUpdate,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.modifier_service")


async def _verify_business_access(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
) -> Business:
    """Helper to verify business exists and belongs to active tenant."""
    result = await session.execute(
        select(Business).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    business = result.scalar_one_or_none()
    if business is None:
        raise TenantNotFoundError("Business not found.")
    return business


async def _verify_menu_item_access(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
) -> MenuItem:
    """Helper to verify menu item exists and belongs to active tenant."""
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


# --- Modifier Group Service ---


async def create_modifier_group(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    payload: ModifierGroupCreate,
) -> ModifierGroup:
    """
    Creates a new reusable modifier group for a business.
    """
    await _verify_business_access(session, tenant, business_id)

    group = ModifierGroup(
        organization_id=tenant.organization_id,
        business_id=business_id,
        **payload.model_dump(),
    )
    session.add(group)
    await session.commit()
    await session.refresh(group)

    await record_audit_log(
        session=session,
        action="MODIFIER_GROUP_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="modifier_group",
        resource_id=str(group.id),
        details={"name_en": group.name_en},
    )
    await session.commit()

    logger.info("Modifier group created", group_id=str(group.id), name_en=group.name_en)
    return await get_modifier_group(session, tenant, business_id, group.id)


async def list_modifier_groups(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    is_active: bool | None = None,
) -> list[ModifierGroupDetailResponse]:
    """
    Retrieves all modifier groups with options for a business.
    """
    await _verify_business_access(session, tenant, business_id)

    query = (
        select(ModifierGroup)
        .options(selectinload(ModifierGroup.options))
        .where(
            ModifierGroup.business_id == business_id,
            ModifierGroup.organization_id == tenant.organization_id,
        )
    )
    if is_active is not None:
        query = query.where(ModifierGroup.is_active.is_(is_active))

    query = query.order_by(ModifierGroup.display_order.asc())
    result = await session.execute(query)
    groups = result.scalars().all()

    return [
        ModifierGroupDetailResponse(
            id=g.id,
            organization_id=g.organization_id,
            business_id=g.business_id,
            name_en=g.name_en,
            name_km=g.name_km,
            description_en=g.description_en,
            description_km=g.description_km,
            min_selections=g.min_selections,
            max_selections=g.max_selections,
            display_order=g.display_order,
            is_active=g.is_active,
            created_at=g.created_at,
            updated_at=g.updated_at,
            options=[ModifierOptionResponse.model_validate(opt) for opt in g.options],
        )
        for g in groups
    ]


async def get_modifier_group(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    group_id: UUID,
) -> ModifierGroup:
    """
    Retrieves a single modifier group with options.
    """
    result = await session.execute(
        select(ModifierGroup)
        .options(selectinload(ModifierGroup.options))
        .where(
            ModifierGroup.id == group_id,
            ModifierGroup.business_id == business_id,
            ModifierGroup.organization_id == tenant.organization_id,
        )
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise TenantNotFoundError("Modifier group not found.")
    return group


async def update_modifier_group(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    group_id: UUID,
    payload: ModifierGroupUpdate,
) -> ModifierGroup:
    """
    Partially updates a modifier group.
    """
    group = await get_modifier_group(session, tenant, business_id, group_id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(group, field, value)

    await session.commit()
    await session.refresh(group)

    await record_audit_log(
        session=session,
        action="MODIFIER_GROUP_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="modifier_group",
        resource_id=str(group_id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info("Modifier group updated", group_id=str(group_id))
    return await get_modifier_group(session, tenant, business_id, group_id)


async def delete_modifier_group(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    group_id: UUID,
) -> None:
    """
    Deletes a modifier group and its options.
    """
    group = await get_modifier_group(session, tenant, business_id, group_id)

    await session.delete(group)
    await session.commit()

    await record_audit_log(
        session=session,
        action="MODIFIER_GROUP_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="modifier_group",
        resource_id=str(group_id),
    )
    await session.commit()

    logger.info("Modifier group deleted", group_id=str(group_id))


# --- Modifier Option Service ---


async def create_modifier_option(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    group_id: UUID,
    payload: ModifierOptionCreate,
) -> ModifierOption:
    """
    Creates a new modifier option / add-on item in a group.
    """
    # Verify group exists in business
    await get_modifier_group(session, tenant, business_id, group_id)

    option = ModifierOption(
        organization_id=tenant.organization_id,
        business_id=business_id,
        group_id=group_id,
        **payload.model_dump(),
    )
    session.add(option)
    await session.commit()
    await session.refresh(option)

    await record_audit_log(
        session=session,
        action="MODIFIER_OPTION_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="modifier_option",
        resource_id=str(option.id),
        details={"name_en": option.name_en, "price": str(option.price)},
    )
    await session.commit()

    logger.info("Modifier option created", option_id=str(option.id))
    return option


async def update_modifier_option(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    group_id: UUID,
    option_id: UUID,
    payload: ModifierOptionUpdate,
) -> ModifierOption:
    """
    Partially updates a modifier option.
    """
    result = await session.execute(
        select(ModifierOption).where(
            ModifierOption.id == option_id,
            ModifierOption.group_id == group_id,
            ModifierOption.business_id == business_id,
            ModifierOption.organization_id == tenant.organization_id,
        )
    )
    option = result.scalar_one_or_none()
    if option is None:
        raise TenantNotFoundError("Modifier option not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(option, field, value)

    await session.commit()
    await session.refresh(option)

    await record_audit_log(
        session=session,
        action="MODIFIER_OPTION_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="modifier_option",
        resource_id=str(option_id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info("Modifier option updated", option_id=str(option_id))
    return option


async def delete_modifier_option(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    group_id: UUID,
    option_id: UUID,
) -> None:
    """
    Deletes a modifier option.
    """
    result = await session.execute(
        select(ModifierOption).where(
            ModifierOption.id == option_id,
            ModifierOption.group_id == group_id,
            ModifierOption.business_id == business_id,
            ModifierOption.organization_id == tenant.organization_id,
        )
    )
    option = result.scalar_one_or_none()
    if option is None:
        raise TenantNotFoundError("Modifier option not found.")

    await session.delete(option)
    await session.commit()

    await record_audit_log(
        session=session,
        action="MODIFIER_OPTION_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="modifier_option",
        resource_id=str(option_id),
    )
    await session.commit()

    logger.info("Modifier option deleted", option_id=str(option_id))


# --- Menu Item & Modifier Group Association Service ---


async def assign_modifier_groups_to_item(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    payload: AssignModifierGroupsRequest,
) -> list[ModifierGroupDetailResponse]:
    """
    Assigns a list of modifier groups to a menu item.
    """
    await _verify_menu_item_access(session, tenant, business_id, item_id)

    # Delete existing links for this item
    await session.execute(
        delete(MenuItemModifierGroup).where(
            MenuItemModifierGroup.menu_item_id == item_id,
            MenuItemModifierGroup.business_id == business_id,
            MenuItemModifierGroup.organization_id == tenant.organization_id,
        )
    )

    # Validate and insert new links
    for order, group_id in enumerate(payload.group_ids):
        # Verify group exists in business
        grp = await get_modifier_group(session, tenant, business_id, group_id)
        link = MenuItemModifierGroup(
            organization_id=tenant.organization_id,
            business_id=business_id,
            menu_item_id=item_id,
            modifier_group_id=grp.id,
            display_order=order,
        )
        session.add(link)

    await session.commit()

    await record_audit_log(
        session=session,
        action="ITEM_MODIFIERS_ASSIGNED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="menu_item",
        resource_id=str(item_id),
        details={"group_count": len(payload.group_ids)},
    )
    await session.commit()

    logger.info(
        "Modifier groups assigned to item",
        item_id=str(item_id),
        count=len(payload.group_ids),
    )
    return await get_item_modifier_groups(session, tenant, business_id, item_id)


async def get_item_modifier_groups(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
) -> list[ModifierGroupDetailResponse]:
    """
    Retrieves all modifier groups attached to a menu item.
    """
    await _verify_menu_item_access(session, tenant, business_id, item_id)

    result = await session.execute(
        select(MenuItemModifierGroup)
        .options(
            selectinload(MenuItemModifierGroup.group).selectinload(
                ModifierGroup.options
            )
        )
        .where(
            MenuItemModifierGroup.menu_item_id == item_id,
            MenuItemModifierGroup.business_id == business_id,
            MenuItemModifierGroup.organization_id == tenant.organization_id,
        )
        .order_by(MenuItemModifierGroup.display_order.asc())
    )
    links = result.scalars().all()

    return [
        ModifierGroupDetailResponse(
            id=link.group.id,
            organization_id=link.group.organization_id,
            business_id=link.group.business_id,
            name_en=link.group.name_en,
            name_km=link.group.name_km,
            description_en=link.group.description_en,
            description_km=link.group.description_km,
            min_selections=link.group.min_selections,
            max_selections=link.group.max_selections,
            display_order=link.group.display_order,
            is_active=link.group.is_active,
            created_at=link.group.created_at,
            updated_at=link.group.updated_at,
            options=[
                ModifierOptionResponse.model_validate(opt) for opt in link.group.options
            ],
        )
        for link in links
    ]
