from math import ceil
from uuid import UUID

import structlog
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.business import Business
from app.models.category import Category
from app.models.menu_item import MenuItem
from app.schemas.menu_item import (
    MenuItemCreate,
    MenuItemPaginationResponse,
    MenuItemResponse,
    MenuItemUpdate,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.menu_item_service")


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


async def create_menu_item(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    payload: MenuItemCreate,
) -> MenuItem:
    """
    Creates a new menu item under a tenant business.
    """
    await _verify_business_access(session, tenant, business_id)

    # Validate category if provided
    if payload.category_id is not None:
        cat_res = await session.execute(
            select(Category).where(
                Category.id == payload.category_id,
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
            )
        )
        if cat_res.scalar_one_or_none() is None:
            raise TenantNotFoundError("Category not found in business.")

    # Validate SKU uniqueness if provided
    if payload.sku:
        sku_check = await session.execute(
            select(MenuItem.id).where(
                MenuItem.business_id == business_id,
                MenuItem.sku == payload.sku,
            )
        )
        if sku_check.scalar_one_or_none() is not None:
            raise ResourceConflictError(
                f"Item with SKU '{payload.sku}' already exists in this business."
            )

    item_data = payload.model_dump()
    item = MenuItem(
        organization_id=tenant.organization_id,
        business_id=business_id,
        **item_data,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)

    await record_audit_log(
        session=session,
        action="MENU_ITEM_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="menu_item",
        resource_id=str(item.id),
        details={
            "name_en": item.name_en,
            "sku": item.sku,
            "price": str(item.base_price),
        },
    )
    await session.commit()

    logger.info(
        "Menu item created successfully",
        item_id=str(item.id),
        name_en=item.name_en,
        sku=item.sku,
        business_id=str(business_id),
    )
    return await get_menu_item(session, tenant, business_id, item.id)


async def list_menu_items(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    category_id: UUID | None = None,
    is_active: bool | None = None,
    is_featured: bool | None = None,
    is_popular: bool | None = None,
    is_new: bool | None = None,
    is_vegetarian: bool | None = None,
    is_vegan: bool | None = None,
    is_halal: bool | None = None,
    is_gluten_free: bool | None = None,
    spice_level: int | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> MenuItemPaginationResponse:
    """
    Lists menu items with comprehensive filtering, search, and pagination.
    """
    await _verify_business_access(session, tenant, business_id)

    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    query = select(MenuItem).where(
        MenuItem.business_id == business_id,
        MenuItem.organization_id == tenant.organization_id,
    )

    if category_id is not None:
        query = query.where(MenuItem.category_id == category_id)
    if is_active is not None:
        query = query.where(MenuItem.is_active.is_(is_active))
    if is_featured is not None:
        query = query.where(MenuItem.is_featured.is_(is_featured))
    if is_popular is not None:
        query = query.where(MenuItem.is_popular.is_(is_popular))
    if is_new is not None:
        query = query.where(MenuItem.is_new.is_(is_new))
    if is_vegetarian is not None:
        query = query.where(MenuItem.is_vegetarian.is_(is_vegetarian))
    if is_vegan is not None:
        query = query.where(MenuItem.is_vegan.is_(is_vegan))
    if is_halal is not None:
        query = query.where(MenuItem.is_halal.is_(is_halal))
    if is_gluten_free is not None:
        query = query.where(MenuItem.is_gluten_free.is_(is_gluten_free))
    if spice_level is not None:
        query = query.where(MenuItem.spice_level == spice_level)

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                MenuItem.name_en.ilike(search_pattern),
                MenuItem.name_km.ilike(search_pattern),
                MenuItem.sku.ilike(search_pattern),
                MenuItem.description_en.ilike(search_pattern),
            )
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_res = await session.execute(count_query)
    total = total_res.scalar_one()

    # Paginate and order
    offset = (page - 1) * page_size
    items_query = (
        query.options(selectinload(MenuItem.variants))
        .order_by(MenuItem.display_order.asc(), MenuItem.created_at.asc())
        .offset(offset)
        .limit(page_size)
    )
    items_res = await session.execute(items_query)
    items = items_res.scalars().all()

    total_pages = ceil(total / page_size) if total > 0 else 1

    return MenuItemPaginationResponse(
        items=[MenuItemResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def get_menu_item(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
) -> MenuItem:
    """
    Retrieves a single menu item ensuring tenant and business isolation.
    """
    result = await session.execute(
        select(MenuItem)
        .options(selectinload(MenuItem.variants))
        .where(
            MenuItem.id == item_id,
            MenuItem.business_id == business_id,
            MenuItem.organization_id == tenant.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise TenantNotFoundError("Menu item not found.")
    return item


async def update_menu_item(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
    payload: MenuItemUpdate,
) -> MenuItem:
    """
    Partially updates a menu item.
    """
    item = await get_menu_item(session, tenant, business_id, item_id)

    update_data = payload.model_dump(exclude_unset=True)

    # Validate category if modified
    if "category_id" in update_data and update_data["category_id"] is not None:
        cat_res = await session.execute(
            select(Category.id).where(
                Category.id == update_data["category_id"],
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
            )
        )
        if cat_res.scalar_one_or_none() is None:
            raise TenantNotFoundError("Category not found in business.")

    # Validate SKU uniqueness if modified
    if "sku" in update_data and update_data["sku"] != item.sku and update_data["sku"]:
        sku_check = await session.execute(
            select(MenuItem.id).where(
                MenuItem.business_id == business_id,
                MenuItem.sku == update_data["sku"],
                MenuItem.id != item_id,
            )
        )
        if sku_check.scalar_one_or_none() is not None:
            raise ResourceConflictError(
                f"Item with SKU '{update_data['sku']}' already exists in this business."
            )

    for field, value in update_data.items():
        setattr(item, field, value)

    await session.commit()
    await session.refresh(item)

    await record_audit_log(
        session=session,
        action="MENU_ITEM_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="menu_item",
        resource_id=str(item.id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info(
        "Menu item updated successfully",
        item_id=str(item_id),
        updated_fields=list(update_data.keys()),
    )
    return await get_menu_item(session, tenant, business_id, item_id)


async def delete_menu_item(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    item_id: UUID,
) -> None:
    """
    Deletes a menu item from the business catalog.
    """
    item = await get_menu_item(session, tenant, business_id, item_id)

    await session.delete(item)
    await session.commit()

    await record_audit_log(
        session=session,
        action="MENU_ITEM_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="menu_item",
        resource_id=str(item_id),
    )
    await session.commit()

    logger.info(
        "Menu item deleted successfully",
        item_id=str(item_id),
        business_id=str(business_id),
    )
