import math
from uuid import UUID

import structlog
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.business import Business
from app.models.category import Category
from app.models.combo import Combo, ComboGroup, ComboGroupItem
from app.schemas.combo import (
    ComboCreate,
    ComboDetailResponse,
    ComboGroupCreate,
    ComboGroupItemResponse,
    ComboGroupResponse,
    ComboPaginationResponse,
    ComboUpdate,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.combo_service")


async def _verify_business_access(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
) -> Business:
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


def _map_combo_to_detail_response(combo: Combo) -> ComboDetailResponse:
    """Helper to convert Combo ORM model to ComboDetailResponse with item names."""
    group_responses: list[ComboGroupResponse] = []
    for grp in combo.groups:
        item_responses: list[ComboGroupItemResponse] = []
        for gi in grp.items:
            item_responses.append(
                ComboGroupItemResponse(
                    id=gi.id,
                    combo_group_id=gi.combo_group_id,
                    menu_item_id=gi.menu_item_id,
                    menu_item_name_en=gi.menu_item.name_en if gi.menu_item else None,
                    menu_item_name_km=gi.menu_item.name_km if gi.menu_item else None,
                    additional_price=gi.additional_price,
                    is_default=gi.is_default,
                    display_order=gi.display_order,
                )
            )
        group_responses.append(
            ComboGroupResponse(
                id=grp.id,
                combo_id=grp.combo_id,
                name_en=grp.name_en,
                name_km=grp.name_km,
                min_quantity=grp.min_quantity,
                max_quantity=grp.max_quantity,
                display_order=grp.display_order,
                items=item_responses,
            )
        )

    return ComboDetailResponse(
        id=combo.id,
        organization_id=combo.organization_id,
        business_id=combo.business_id,
        category_id=combo.category_id,
        sku=combo.sku,
        name_en=combo.name_en,
        name_km=combo.name_km,
        description_en=combo.description_en,
        description_km=combo.description_km,
        pricing_type=combo.pricing_type,
        base_price=combo.base_price,
        discount_percentage=combo.discount_percentage,
        currency=combo.currency,
        image_url=combo.image_url,
        is_active=combo.is_active,
        display_order=combo.display_order,
        created_at=combo.created_at,
        updated_at=combo.updated_at,
        groups=group_responses,
    )


async def create_combo(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    payload: ComboCreate,
) -> ComboDetailResponse:
    """
    Creates a new combo bundle with nested choice groups and eligible items.
    """
    await _verify_business_access(session, tenant, business_id)

    if payload.category_id is not None:
        cat_result = await session.execute(
            select(Category).where(
                Category.id == payload.category_id,
                Category.business_id == business_id,
                Category.organization_id == tenant.organization_id,
            )
        )
        if cat_result.scalar_one_or_none() is None:
            raise TenantNotFoundError("Category not found in this business.")

    combo_data = payload.model_dump(exclude={"groups"})
    combo = Combo(
        organization_id=tenant.organization_id,
        business_id=business_id,
        **combo_data,
    )
    session.add(combo)
    await session.flush()

    for g_idx, group_in in enumerate(payload.groups):
        grp = ComboGroup(
            organization_id=tenant.organization_id,
            business_id=business_id,
            combo_id=combo.id,
            name_en=group_in.name_en,
            name_km=group_in.name_km,
            min_quantity=group_in.min_quantity,
            max_quantity=group_in.max_quantity,
            display_order=group_in.display_order if group_in.display_order else g_idx,
        )
        session.add(grp)
        await session.flush()

        for i_idx, item_in in enumerate(group_in.items):
            gi = ComboGroupItem(
                organization_id=tenant.organization_id,
                business_id=business_id,
                combo_group_id=grp.id,
                menu_item_id=item_in.menu_item_id,
                additional_price=item_in.additional_price,
                is_default=item_in.is_default,
                display_order=item_in.display_order if item_in.display_order else i_idx,
            )
            session.add(gi)

    await session.commit()

    await record_audit_log(
        session=session,
        action="COMBO_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="combo",
        resource_id=str(combo.id),
        details={"name_en": combo.name_en, "pricing_type": combo.pricing_type},
    )
    await session.commit()

    logger.info(
        "Combo created successfully", combo_id=str(combo.id), name_en=combo.name_en
    )
    return await get_combo(session, tenant, business_id, combo.id)


async def list_combos(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    is_active: bool | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> ComboPaginationResponse:
    """
    Lists combo bundles with pagination and keyword filtering.
    """
    await _verify_business_access(session, tenant, business_id)

    query = select(Combo).where(
        Combo.business_id == business_id,
        Combo.organization_id == tenant.organization_id,
    )
    if is_active is not None:
        query = query.where(Combo.is_active.is_(is_active))
    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                Combo.name_en.ilike(term),
                Combo.name_km.ilike(term),
                Combo.sku.ilike(term),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_count = (await session.execute(count_query)).scalar_one()

    offset = (page - 1) * page_size
    query = (
        query.options(
            selectinload(Combo.groups)
            .selectinload(ComboGroup.items)
            .selectinload(ComboGroupItem.menu_item)
        )
        .order_by(Combo.display_order.asc(), Combo.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )

    result = await session.execute(query)
    combos = result.scalars().all()

    total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1
    items = [_map_combo_to_detail_response(c) for c in combos]

    return ComboPaginationResponse(
        items=items,
        total=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def get_combo(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    combo_id: UUID,
) -> ComboDetailResponse:
    """
    Retrieves a combo bundle by ID with all groups and eligible items.
    """
    result = await session.execute(
        select(Combo)
        .options(
            selectinload(Combo.groups)
            .selectinload(ComboGroup.items)
            .selectinload(ComboGroupItem.menu_item)
        )
        .where(
            Combo.id == combo_id,
            Combo.business_id == business_id,
            Combo.organization_id == tenant.organization_id,
        )
    )
    combo = result.scalar_one_or_none()
    if combo is None:
        raise TenantNotFoundError("Combo not found.")
    return _map_combo_to_detail_response(combo)


async def update_combo(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    combo_id: UUID,
    payload: ComboUpdate,
) -> ComboDetailResponse:
    """
    Partially updates a combo bundle.
    """
    result = await session.execute(
        select(Combo).where(
            Combo.id == combo_id,
            Combo.business_id == business_id,
            Combo.organization_id == tenant.organization_id,
        )
    )
    combo = result.scalar_one_or_none()
    if combo is None:
        raise TenantNotFoundError("Combo not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(combo, field, value)

    await session.commit()
    await session.refresh(combo)

    await record_audit_log(
        session=session,
        action="COMBO_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="combo",
        resource_id=str(combo_id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info("Combo updated successfully", combo_id=str(combo_id))
    return await get_combo(session, tenant, business_id, combo_id)


async def delete_combo(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    combo_id: UUID,
) -> None:
    """
    Deletes a combo bundle and cascades delete to groups and items.
    """
    result = await session.execute(
        select(Combo).where(
            Combo.id == combo_id,
            Combo.business_id == business_id,
            Combo.organization_id == tenant.organization_id,
        )
    )
    combo = result.scalar_one_or_none()
    if combo is None:
        raise TenantNotFoundError("Combo not found.")

    await session.delete(combo)
    await session.commit()

    await record_audit_log(
        session=session,
        action="COMBO_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="combo",
        resource_id=str(combo_id),
    )
    await session.commit()

    logger.info("Combo deleted successfully", combo_id=str(combo_id))


async def create_combo_group(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    combo_id: UUID,
    payload: ComboGroupCreate,
) -> ComboDetailResponse:
    """
    Adds a new choice group to an existing combo bundle.
    """
    # Verify combo exists
    await get_combo(session, tenant, business_id, combo_id)

    grp = ComboGroup(
        organization_id=tenant.organization_id,
        business_id=business_id,
        combo_id=combo_id,
        name_en=payload.name_en,
        name_km=payload.name_km,
        min_quantity=payload.min_quantity,
        max_quantity=payload.max_quantity,
        display_order=payload.display_order,
    )
    session.add(grp)
    await session.flush()

    for idx, item_in in enumerate(payload.items):
        gi = ComboGroupItem(
            organization_id=tenant.organization_id,
            business_id=business_id,
            combo_group_id=grp.id,
            menu_item_id=item_in.menu_item_id,
            additional_price=item_in.additional_price,
            is_default=item_in.is_default,
            display_order=item_in.display_order if item_in.display_order else idx,
        )
        session.add(gi)

    await session.commit()

    await record_audit_log(
        session=session,
        action="COMBO_GROUP_ADDED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="combo_group",
        resource_id=str(grp.id),
        details={"combo_id": str(combo_id), "name_en": grp.name_en},
    )
    await session.commit()

    return await get_combo(session, tenant, business_id, combo_id)


async def delete_combo_group(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    combo_id: UUID,
    group_id: UUID,
) -> ComboDetailResponse:
    """
    Deletes a choice group from a combo bundle.
    """
    result = await session.execute(
        select(ComboGroup).where(
            ComboGroup.id == group_id,
            ComboGroup.combo_id == combo_id,
            ComboGroup.business_id == business_id,
            ComboGroup.organization_id == tenant.organization_id,
        )
    )
    grp = result.scalar_one_or_none()
    if grp is None:
        raise TenantNotFoundError("Combo group not found.")

    await session.delete(grp)
    await session.commit()

    await record_audit_log(
        session=session,
        action="COMBO_GROUP_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="combo_group",
        resource_id=str(group_id),
    )
    await session.commit()

    return await get_combo(session, tenant, business_id, combo_id)
