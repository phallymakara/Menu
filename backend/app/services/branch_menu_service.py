from uuid import UUID

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.branch_menu import BranchCategoryAssignment, BranchItemOverride
from app.models.business import Business
from app.models.category import Category
from app.models.menu_item import MenuItem
from app.models.modifier import MenuItemModifierGroup, ModifierGroup
from app.schemas.branch_menu import (
    BranchCategoryAssignmentRequest,
    BranchCategoryMenuResponse,
    BranchItemOverrideCreate,
    BranchItemOverrideResponse,
    BranchMenuCatalogResponse,
    BranchMenuItemDisplayResponse,
    BulkBranchItemOverrideRequest,
)
from app.schemas.item_variant import ItemVariantResponse
from app.schemas.modifier import ModifierGroupDetailResponse, ModifierOptionResponse
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.branch_menu_service")


async def _verify_branch_access(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
) -> Branch:
    """Helper to verify branch exists and belongs to active tenant."""
    result = await session.execute(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.business_id == business_id,
            Branch.organization_id == tenant.organization_id,
        )
    )
    branch = result.scalar_one_or_none()
    if branch is None:
        raise TenantNotFoundError("Branch not found.")
    return branch


async def _verify_menu_item_access(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
) -> MenuItem:
    """Helper to verify menu item exists in business catalog."""
    result = await session.execute(
        select(MenuItem).where(
            MenuItem.id == item_id,
            MenuItem.business_id == business_id,
            MenuItem.organization_id == tenant.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise TenantNotFoundError("Menu item not found in this business catalog.")
    return item


async def set_branch_item_override(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    item_id: UUID,
    payload: BranchItemOverrideCreate,
) -> BranchItemOverrideResponse:
    """
    Sets or updates a branch-specific price and stock override for a menu item.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)
    await _verify_menu_item_access(session, tenant, business_id, item_id)

    result = await session.execute(
        select(BranchItemOverride).where(
            BranchItemOverride.branch_id == branch_id,
            BranchItemOverride.menu_item_id == item_id,
            BranchItemOverride.business_id == business_id,
            BranchItemOverride.organization_id == tenant.organization_id,
        )
    )
    override = result.scalar_one_or_none()

    if override is None:
        override = BranchItemOverride(
            organization_id=tenant.organization_id,
            business_id=business_id,
            branch_id=branch_id,
            menu_item_id=item_id,
            price_override=payload.price_override,
            availability_status=str(payload.availability_status),
            is_featured_override=payload.is_featured_override,
        )
        session.add(override)
    else:
        override.price_override = payload.price_override
        override.availability_status = str(payload.availability_status)
        override.is_featured_override = payload.is_featured_override

    await session.commit()
    await session.refresh(override)

    await record_audit_log(
        session=session,
        action="BRANCH_ITEM_OVERRIDE_SET",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="branch_item_override",
        resource_id=str(override.id),
        details={
            "branch_id": str(branch_id),
            "menu_item_id": str(item_id),
            "availability_status": override.availability_status,
            "price_override": str(override.price_override)
            if override.price_override
            else None,
        },
    )
    await session.commit()

    logger.info(
        "Branch item override saved",
        branch_id=str(branch_id),
        item_id=str(item_id),
        status=override.availability_status,
    )
    return BranchItemOverrideResponse.model_validate(override)


async def bulk_set_branch_item_overrides(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: BulkBranchItemOverrideRequest,
) -> list[BranchItemOverrideResponse]:
    """
    Bulk saves multiple item overrides for quick stock toggles.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)

    responses: list[BranchItemOverrideResponse] = []
    for item_in in payload.overrides:
        resp = await set_branch_item_override(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            item_id=item_in.menu_item_id,
            payload=item_in,
        )
        responses.append(resp)

    return responses


async def delete_branch_item_override(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    item_id: UUID,
) -> None:
    """
    Deletes branch item override, restoring master catalog defaults.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)

    result = await session.execute(
        select(BranchItemOverride).where(
            BranchItemOverride.branch_id == branch_id,
            BranchItemOverride.menu_item_id == item_id,
            BranchItemOverride.business_id == business_id,
            BranchItemOverride.organization_id == tenant.organization_id,
        )
    )
    override = result.scalar_one_or_none()
    if override:
        await session.delete(override)
        await session.commit()

        await record_audit_log(
            session=session,
            action="BRANCH_ITEM_OVERRIDE_DELETED",
            organization_id=tenant.organization_id,
            user_id=tenant.user_id,
            resource_type="branch_item_override",
            resource_id=str(override.id),
            details={"branch_id": str(branch_id), "menu_item_id": str(item_id)},
        )
        await session.commit()

    logger.info(
        "Branch item override reset to master",
        branch_id=str(branch_id),
        item_id=str(item_id),
    )


async def assign_categories_to_branch(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: BranchCategoryAssignmentRequest,
) -> list[UUID]:
    """
    Selectively publishes categories to a branch.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)

    # Delete existing category assignments
    await session.execute(
        delete(BranchCategoryAssignment).where(
            BranchCategoryAssignment.branch_id == branch_id,
            BranchCategoryAssignment.business_id == business_id,
            BranchCategoryAssignment.organization_id == tenant.organization_id,
        )
    )

    for order, cat_id in enumerate(payload.category_ids):
        # Verify category exists in business
        cat_result = await session.execute(
            select(Category).where(
                Category.id == cat_id,
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
            )
        )
        if cat_result.scalar_one_or_none() is None:
            raise TenantNotFoundError(f"Category '{cat_id}' not found.")

        assignment = BranchCategoryAssignment(
            organization_id=tenant.organization_id,
            business_id=business_id,
            branch_id=branch_id,
            category_id=cat_id,
            display_order=order,
        )
        session.add(assignment)

    await session.commit()

    await record_audit_log(
        session=session,
        action="BRANCH_CATEGORIES_ASSIGNED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="branch",
        resource_id=str(branch_id),
        details={"category_count": len(payload.category_ids)},
    )
    await session.commit()

    logger.info(
        "Branch categories assigned",
        branch_id=str(branch_id),
        count=len(payload.category_ids),
    )
    return payload.category_ids


async def get_branch_published_menu(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    include_hidden: bool = False,
) -> BranchMenuCatalogResponse:
    """
    Resolves the live published menu catalog for a branch (for POS & QR Digital Menu).
    Merges master items with branch-specific price & stock overrides.
    """
    branch = await _verify_branch_access(session, tenant, business_id, branch_id)

    # Fetch business fallback financial settings if branch doesn't override them
    biz_result = await session.execute(
        select(Business).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    business = biz_result.scalar_one()

    # 1. Determine active categories assigned to this branch
    cat_assign_result = await session.execute(
        select(BranchCategoryAssignment)
        .where(
            BranchCategoryAssignment.branch_id == branch_id,
            BranchCategoryAssignment.business_id == business_id,
            BranchCategoryAssignment.organization_id == tenant.organization_id,
            BranchCategoryAssignment.is_active.is_(True),
        )
        .order_by(BranchCategoryAssignment.display_order.asc())
    )
    assigned_records = cat_assign_result.scalars().all()

    if assigned_records:
        cat_ids = [r.category_id for r in assigned_records]
        cat_result = await session.execute(
            select(Category)
            .where(
                Category.id.in_(cat_ids),
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
                Category.is_active.is_(True),
            )
            .order_by(Category.display_order.asc())
        )
        categories = cat_result.scalars().all()
    else:
        # If no explicit category assignments, publish all active categories by default
        cat_result = await session.execute(
            select(Category)
            .where(
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
                Category.is_active.is_(True),
            )
            .order_by(Category.display_order.asc())
        )
        categories = cat_result.scalars().all()

    # 2. Fetch all branch item overrides
    overrides_result = await session.execute(
        select(BranchItemOverride).where(
            BranchItemOverride.branch_id == branch_id,
            BranchItemOverride.business_id == business_id,
            BranchItemOverride.organization_id == tenant.organization_id,
        )
    )
    overrides = {o.menu_item_id: o for o in overrides_result.scalars().all()}

    # 3. Fetch all active menu items for these categories
    cat_ids_list = [c.id for c in categories]
    items_result = await session.execute(
        select(MenuItem)
        .options(
            selectinload(MenuItem.variants),
            selectinload(MenuItem.modifier_group_links)
            .selectinload(MenuItemModifierGroup.group)
            .selectinload(ModifierGroup.options),
        )
        .where(
            MenuItem.category_id.in_(cat_ids_list),
            MenuItem.business_id == business_id,
            MenuItem.organization_id == tenant.organization_id,
            MenuItem.is_active.is_(True),
        )
        .order_by(MenuItem.display_order.asc(), MenuItem.name_en.asc())
    )
    all_items = items_result.scalars().all()

    # Group items by category_id
    items_by_cat: dict[UUID, list[MenuItem]] = {}
    for item in all_items:
        items_by_cat.setdefault(item.category_id, []).append(item)

    total_published_items = 0
    category_responses: list[BranchCategoryMenuResponse] = []

    for cat in categories:
        cat_items = items_by_cat.get(cat.id, [])
        resolved_items: list[BranchMenuItemDisplayResponse] = []

        for item in cat_items:
            override = overrides.get(item.id)
            availability = override.availability_status if override else "AVAILABLE"

            # Filter out hidden items if requested
            if not include_hidden and availability == "HIDDEN":
                continue

            effective_price = (
                override.price_override
                if (override and override.price_override is not None)
                else item.base_price
            )
            is_featured = (
                override.is_featured_override
                if (override and override.is_featured_override is not None)
                else item.is_featured
            )

            # Resolved modifier groups
            mod_groups: list[ModifierGroupDetailResponse] = []
            for link in item.modifier_group_links:
                if link.group and link.group.is_active:
                    mod_groups.append(
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
                                ModifierOptionResponse.model_validate(opt)
                                for opt in link.group.options
                                if opt.is_active
                            ],
                        )
                    )

            # Resolved variants
            var_list = [
                ItemVariantResponse.model_validate(v)
                for v in item.variants
                if v.is_active
            ]

            resolved_item = BranchMenuItemDisplayResponse(
                id=item.id,
                category_id=item.category_id,
                sku=item.sku,
                name_en=item.name_en,
                name_km=item.name_km,
                description_en=item.description_en,
                description_km=item.description_km,
                master_price=item.base_price,
                price_override=override.price_override if override else None,
                effective_price=effective_price,
                currency=branch.base_currency or item.currency,
                image_url=item.image_url,
                gallery_images=item.gallery_images or [],
                prep_time_minutes=item.prep_time_minutes,
                kitchen_station=item.kitchen_station,
                is_vegetarian=item.is_vegetarian,
                is_vegan=item.is_vegan,
                is_halal=item.is_halal,
                is_gluten_free=item.is_gluten_free,
                contains_nuts=item.contains_nuts,
                contains_dairy=item.contains_dairy,
                spice_level=item.spice_level,
                is_featured=is_featured,
                is_popular=item.is_popular,
                is_new=item.is_new,
                display_order=item.display_order,
                availability_status=availability,
                is_available=(availability == "AVAILABLE"),
                variants=var_list,
                modifier_groups=mod_groups,
            )
            resolved_items.append(resolved_item)
            total_published_items += 1

        category_responses.append(
            BranchCategoryMenuResponse(
                id=cat.id,
                name_en=cat.name_en,
                name_km=cat.name_km,
                description_en=cat.description_en,
                description_km=cat.description_km,
                icon=cat.icon,
                image_url=cat.image_url,
                display_order=cat.display_order,
                items=resolved_items,
            )
        )

    return BranchMenuCatalogResponse(
        branch_id=branch.id,
        branch_name_en=branch.name_en,
        branch_name_km=branch.name_km,
        currency=branch.base_currency or business.base_currency,
        exchange_rate=branch.exchange_rate or business.exchange_rate,
        tax_percentage=branch.tax_percentage
        if branch.tax_percentage is not None
        else business.tax_percentage,
        is_tax_inclusive=branch.is_tax_inclusive
        if branch.is_tax_inclusive is not None
        else business.is_tax_inclusive,
        service_charge_percentage=branch.service_charge_percentage
        if branch.service_charge_percentage is not None
        else business.service_charge_percentage,
        is_service_charge_inclusive=branch.is_service_charge_inclusive
        if branch.is_service_charge_inclusive is not None
        else business.is_service_charge_inclusive,
        categories=category_responses,
        total_items=total_published_items,
    )
