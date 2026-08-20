from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    ResourceConflictError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.models.business import Business
from app.models.category import Category
from app.schemas.category import (
    CategoryCreate,
    CategoryReorderRequest,
    CategoryResponse,
    CategoryTreeResponse,
    CategoryUpdate,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.category_service")


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


async def create_category(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    payload: CategoryCreate,
) -> Category:
    """
    Creates a new menu category or subcategory under a tenant business.
    """
    await _verify_business_access(session, tenant, business_id)

    # Validate parent category if provided
    if payload.parent_id is not None:
        parent_res = await session.execute(
            select(Category).where(
                Category.id == payload.parent_id,
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
            )
        )
        parent = parent_res.scalar_one_or_none()
        if parent is None:
            raise TenantNotFoundError("Parent category not found.")

        # Limit nesting to 2 levels (Category -> Subcategory)
        if parent.parent_id is not None:
            raise ResourceConflictError(
                "Nested subcategories beyond 2 levels are not supported."
            )

    category_data = payload.model_dump()
    category = Category(
        organization_id=tenant.organization_id,
        business_id=business_id,
        **category_data,
    )
    session.add(category)
    await session.commit()
    await session.refresh(category)

    await record_audit_log(
        session=session,
        action="CATEGORY_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="category",
        resource_id=str(category.id),
        details={"name_en": category.name_en, "parent_id": str(category.parent_id)},
    )
    await session.commit()

    logger.info(
        "Category created successfully",
        category_id=str(category.id),
        name_en=category.name_en,
        business_id=str(business_id),
    )
    return category


async def list_categories(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    is_active: bool | None = None,
    tree: bool = False,
) -> list[CategoryResponse | CategoryTreeResponse]:
    """
    Retrieves all categories for a business, either flat or as a nested tree.
    """
    await _verify_business_access(session, tenant, business_id)

    if tree:
        # Query top-level categories with subcategories eager loaded
        query = (
            select(Category)
            .options(selectinload(Category.subcategories))
            .where(
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
                Category.parent_id.is_(None),
            )
        )
        if is_active is not None:
            query = query.where(Category.is_active.is_(is_active))

        query = query.order_by(Category.display_order.asc())
        result = await session.execute(query)
        categories = result.scalars().all()

        tree_items = []
        for cat in categories:
            subcats = cat.subcategories
            if is_active is not None:
                subcats = [s for s in subcats if s.is_active == is_active]
            subcats.sort(key=lambda s: s.display_order)

            tree_items.append(
                CategoryTreeResponse(
                    id=cat.id,
                    organization_id=cat.organization_id,
                    business_id=cat.business_id,
                    parent_id=cat.parent_id,
                    name_en=cat.name_en,
                    name_km=cat.name_km,
                    description_en=cat.description_en,
                    description_km=cat.description_km,
                    icon=cat.icon,
                    image_url=cat.image_url,
                    display_order=cat.display_order,
                    is_active=cat.is_active,
                    created_at=cat.created_at,
                    updated_at=cat.updated_at,
                    subcategories=[
                        CategoryResponse.model_validate(sub) for sub in subcats
                    ],
                )
            )
        return tree_items

    # Flat list
    flat_query = select(Category).where(
        Category.business_id == business_id,
        Category.organization_id == tenant.organization_id,
    )
    if is_active is not None:
        flat_query = flat_query.where(Category.is_active.is_(is_active))

    flat_query = flat_query.order_by(
        Category.parent_id.asc().nullsfirst(),
        Category.display_order.asc(),
    )
    result = await session.execute(flat_query)
    flat_items = result.scalars().all()
    return [CategoryResponse.model_validate(item) for item in flat_items]


async def get_category(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    category_id: UUID,
) -> Category:
    """
    Retrieves a single category by ID ensuring tenant and business isolation.
    """
    result = await session.execute(
        select(Category)
        .options(selectinload(Category.subcategories))
        .where(
            Category.id == category_id,
            Category.business_id == business_id,
            Category.organization_id == tenant.organization_id,
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise TenantNotFoundError("Category not found.")
    return category


async def update_category(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    category_id: UUID,
    payload: CategoryUpdate,
) -> Category:
    """
    Partially updates a category profile, ordering, or parent relationship.
    """
    category = await get_category(session, tenant, business_id, category_id)

    update_data = payload.model_dump(exclude_unset=True)

    if "parent_id" in update_data and update_data["parent_id"] is not None:
        new_parent_id = update_data["parent_id"]
        if new_parent_id == category_id:
            raise ResourceConflictError("A category cannot be its own parent.")

        parent_res = await session.execute(
            select(Category).where(
                Category.id == new_parent_id,
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
            )
        )
        parent = parent_res.scalar_one_or_none()
        if parent is None:
            raise TenantNotFoundError("Target parent category not found.")

        if parent.parent_id is not None:
            raise ResourceConflictError(
                "Nested subcategories beyond 2 levels are not supported."
            )

    for field, value in update_data.items():
        setattr(category, field, value)

    await session.commit()
    await session.refresh(category)

    await record_audit_log(
        session=session,
        action="CATEGORY_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="category",
        resource_id=str(category.id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info(
        "Category updated successfully",
        category_id=str(category_id),
        updated_fields=list(update_data.keys()),
    )
    return category


async def delete_category(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    category_id: UUID,
) -> None:
    """
    Deletes a category and cascades deletion to any subcategories.
    """
    category = await get_category(session, tenant, business_id, category_id)

    await session.delete(category)
    await session.commit()

    await record_audit_log(
        session=session,
        action="CATEGORY_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="category",
        resource_id=str(category_id),
    )
    await session.commit()

    logger.info(
        "Category deleted successfully",
        category_id=str(category_id),
        business_id=str(business_id),
    )


async def reorder_categories(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    payload: CategoryReorderRequest,
) -> list[CategoryResponse]:
    """
    Batch updates the display_order of categories within a business.
    """
    await _verify_business_access(session, tenant, business_id)

    for item in payload.items:
        res = await session.execute(
            select(Category).where(
                Category.id == item.id,
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
            )
        )
        cat = res.scalar_one_or_none()
        if cat is not None:
            cat.display_order = item.display_order

    await session.commit()

    # Return refreshed flat list
    return await list_categories(
        session=session,
        tenant=tenant,
        business_id=business_id,
        tree=False,
    )
