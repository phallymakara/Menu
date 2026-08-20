from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.dining_area import DiningArea
from app.schemas.dining_area import (
    DiningAreaCreate,
    DiningAreaReorderRequest,
    DiningAreaUpdate,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.dining_area_service")


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


async def create_dining_area(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: DiningAreaCreate,
) -> DiningArea:
    """
    Creates a new dining area / spatial zone for a branch.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)

    area = DiningArea(
        organization_id=tenant.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        **payload.model_dump(),
    )
    session.add(area)
    await session.commit()
    await session.refresh(area)

    await record_audit_log(
        session=session,
        action="DINING_AREA_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="dining_area",
        resource_id=str(area.id),
        details={"name_en": area.name_en, "branch_id": str(branch_id)},
    )
    await session.commit()

    logger.info("Dining area created", area_id=str(area.id), name_en=area.name_en)
    return area


async def list_dining_areas(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    is_active: bool | None = None,
) -> list[DiningArea]:
    """
    Retrieves all dining areas for a branch ordered by display_order.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)

    query = select(DiningArea).where(
        DiningArea.branch_id == branch_id,
        DiningArea.business_id == business_id,
        DiningArea.organization_id == tenant.organization_id,
    )
    if is_active is not None:
        query = query.where(DiningArea.is_active.is_(is_active))

    query = query.order_by(DiningArea.display_order.asc(), DiningArea.created_at.asc())
    result = await session.execute(query)
    return list(result.scalars().all())


async def get_dining_area(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    area_id: UUID,
) -> DiningArea:
    """
    Retrieves a single dining area by ID.
    """
    result = await session.execute(
        select(DiningArea).where(
            DiningArea.id == area_id,
            DiningArea.branch_id == branch_id,
            DiningArea.business_id == business_id,
            DiningArea.organization_id == tenant.organization_id,
        )
    )
    area = result.scalar_one_or_none()
    if area is None:
        raise TenantNotFoundError("Dining area not found.")
    return area


async def update_dining_area(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    area_id: UUID,
    payload: DiningAreaUpdate,
) -> DiningArea:
    """
    Partially updates a dining area.
    """
    area = await get_dining_area(session, tenant, business_id, branch_id, area_id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(area, field, value)

    await session.commit()
    await session.refresh(area)

    await record_audit_log(
        session=session,
        action="DINING_AREA_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="dining_area",
        resource_id=str(area_id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info("Dining area updated", area_id=str(area_id))
    return area


async def delete_dining_area(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    area_id: UUID,
) -> None:
    """
    Deletes a dining area.
    """
    area = await get_dining_area(session, tenant, business_id, branch_id, area_id)

    await session.delete(area)
    await session.commit()

    await record_audit_log(
        session=session,
        action="DINING_AREA_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="dining_area",
        resource_id=str(area_id),
        details={"name_en": area.name_en},
    )
    await session.commit()

    logger.info("Dining area deleted", area_id=str(area_id))


async def reorder_dining_areas(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: DiningAreaReorderRequest,
) -> list[DiningArea]:
    """
    Batch updates the display order for dining areas in a branch.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)

    for index, area_id in enumerate(payload.area_ids):
        area = await get_dining_area(session, tenant, business_id, branch_id, area_id)
        area.display_order = index

    await session.commit()

    await record_audit_log(
        session=session,
        action="DINING_AREAS_REORDERED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="branch",
        resource_id=str(branch_id),
        details={"ordered_ids": [str(a) for a in payload.area_ids]},
    )
    await session.commit()

    return await list_dining_areas(session, tenant, business_id, branch_id)
