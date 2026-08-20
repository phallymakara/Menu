from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.dining_area import DiningArea
from app.models.restaurant_table import RestaurantTable
from app.schemas.restaurant_table import (
    RestaurantTableBatchCreate,
    RestaurantTableCreate,
    RestaurantTableResponse,
    RestaurantTableStatusUpdate,
    RestaurantTableUpdate,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.restaurant_table_service")


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


async def _verify_dining_area_access(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    dining_area_id: UUID,
) -> DiningArea:
    """Helper to verify dining area exists in this branch."""
    result = await session.execute(
        select(DiningArea).where(
            DiningArea.id == dining_area_id,
            DiningArea.branch_id == branch_id,
            DiningArea.business_id == business_id,
            DiningArea.organization_id == tenant.organization_id,
        )
    )
    area = result.scalar_one_or_none()
    if area is None:
        raise TenantNotFoundError("Dining area not found in this branch.")
    return area


def _map_table_to_response(table: RestaurantTable) -> RestaurantTableResponse:
    """Helper to map RestaurantTable ORM model to response schema."""
    return RestaurantTableResponse(
        id=table.id,
        organization_id=table.organization_id,
        business_id=table.business_id,
        branch_id=table.branch_id,
        dining_area_id=table.dining_area_id,
        table_number=table.table_number,
        name=table.name,
        min_capacity=table.min_capacity,
        max_capacity=table.max_capacity,
        shape=table.shape,
        status=table.status,
        qr_code_token=table.qr_code_token,
        display_order=table.display_order,
        is_active=table.is_active,
        dining_area_name_en=table.dining_area.name_en if table.dining_area else None,
        dining_area_name_km=table.dining_area.name_km if table.dining_area else None,
        created_at=table.created_at,
        updated_at=table.updated_at,
    )


async def create_table(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: RestaurantTableCreate,
) -> RestaurantTableResponse:
    """
    Creates a new table for a branch.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)

    if payload.dining_area_id:
        await _verify_dining_area_access(
            session, tenant, business_id, branch_id, payload.dining_area_id
        )

    # Check unique table_number in branch
    dup = await session.execute(
        select(RestaurantTable).where(
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.table_number == payload.table_number,
        )
    )
    if dup.scalar_one_or_none() is not None:
        raise ResourceConflictError(
            f"Table number '{payload.table_number}' already exists in this branch."
        )

    table = RestaurantTable(
        organization_id=tenant.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        **payload.model_dump(),
    )
    session.add(table)
    await session.commit()
    await session.refresh(table)

    await record_audit_log(
        session=session,
        action="TABLE_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="table",
        resource_id=str(table.id),
        details={"table_number": table.table_number, "branch_id": str(branch_id)},
    )
    await session.commit()

    logger.info("Table created", table_id=str(table.id), number=table.table_number)
    return await get_table(session, tenant, business_id, branch_id, table.id)


async def batch_create_tables(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: RestaurantTableBatchCreate,
) -> list[RestaurantTableResponse]:
    """
    Generates a sequential batch range of tables for a branch.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)

    if payload.dining_area_id:
        await _verify_dining_area_access(
            session, tenant, business_id, branch_id, payload.dining_area_id
        )

    created_tables: list[RestaurantTable] = []

    for num in range(payload.start_number, payload.end_number + 1):
        padded_num = str(num).zfill(payload.digits)
        tbl_number = f"{payload.prefix}{padded_num}"

        # Check if table already exists
        existing = await session.execute(
            select(RestaurantTable).where(
                RestaurantTable.branch_id == branch_id,
                RestaurantTable.table_number == tbl_number,
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue

        table = RestaurantTable(
            organization_id=tenant.organization_id,
            business_id=business_id,
            branch_id=branch_id,
            dining_area_id=payload.dining_area_id,
            table_number=tbl_number,
            min_capacity=payload.min_capacity,
            max_capacity=payload.max_capacity,
            shape=str(payload.shape),
            display_order=num,
        )
        session.add(table)
        created_tables.append(table)

    await session.commit()

    await record_audit_log(
        session=session,
        action="TABLES_BATCH_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="branch",
        resource_id=str(branch_id),
        details={"created_count": len(created_tables), "prefix": payload.prefix},
    )
    await session.commit()

    logger.info(
        "Batch tables created", count=len(created_tables), branch_id=str(branch_id)
    )
    return await list_tables(session, tenant, business_id, branch_id)


async def list_tables(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    dining_area_id: UUID | None = None,
    status: str | None = None,
    is_active: bool | None = None,
) -> list[RestaurantTableResponse]:
    """
    Lists tables for a branch with optional area, status, and active filters.
    """
    await _verify_branch_access(session, tenant, business_id, branch_id)

    query = (
        select(RestaurantTable)
        .options(selectinload(RestaurantTable.dining_area))
        .where(
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
            RestaurantTable.organization_id == tenant.organization_id,
        )
    )
    if dining_area_id is not None:
        query = query.where(RestaurantTable.dining_area_id == dining_area_id)
    if status is not None:
        query = query.where(RestaurantTable.status == status)
    if is_active is not None:
        query = query.where(RestaurantTable.is_active.is_(is_active))

    query = query.order_by(
        RestaurantTable.display_order.asc(), RestaurantTable.table_number.asc()
    )
    result = await session.execute(query)
    tables = result.scalars().all()

    return [_map_table_to_response(t) for t in tables]


async def get_table(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
) -> RestaurantTableResponse:
    """
    Retrieves a single table by ID.
    """
    result = await session.execute(
        select(RestaurantTable)
        .options(selectinload(RestaurantTable.dining_area))
        .where(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
            RestaurantTable.organization_id == tenant.organization_id,
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")
    return _map_table_to_response(table)


async def update_table(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: RestaurantTableUpdate,
) -> RestaurantTableResponse:
    """
    Partially updates table configuration.
    """
    result = await session.execute(
        select(RestaurantTable).where(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
            RestaurantTable.organization_id == tenant.organization_id,
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    if payload.dining_area_id:
        await _verify_dining_area_access(
            session, tenant, business_id, branch_id, payload.dining_area_id
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(table, field, value)

    await session.commit()
    await session.refresh(table)

    await record_audit_log(
        session=session,
        action="TABLE_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="table",
        resource_id=str(table_id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info("Table updated", table_id=str(table_id))
    return await get_table(session, tenant, business_id, branch_id, table_id)


async def update_table_status(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: RestaurantTableStatusUpdate,
) -> RestaurantTableResponse:
    """
    Quickly transitions a table's operational status (e.g. available -> occupied).
    """
    result = await session.execute(
        select(RestaurantTable).where(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
            RestaurantTable.organization_id == tenant.organization_id,
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    old_status = table.status
    table.status = str(payload.status)

    await session.commit()
    await session.refresh(table)

    await record_audit_log(
        session=session,
        action="TABLE_STATUS_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="table",
        resource_id=str(table_id),
        details={"old_status": old_status, "new_status": table.status},
    )
    await session.commit()

    logger.info(
        "Table status changed",
        table_id=str(table_id),
        old_status=old_status,
        new_status=table.status,
    )
    return await get_table(session, tenant, business_id, branch_id, table_id)


async def delete_table(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
) -> None:
    """
    Deletes a table from a branch.
    """
    result = await session.execute(
        select(RestaurantTable).where(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
            RestaurantTable.organization_id == tenant.organization_id,
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    await session.delete(table)
    await session.commit()

    await record_audit_log(
        session=session,
        action="TABLE_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="table",
        resource_id=str(table_id),
        details={"table_number": table.table_number},
    )
    await session.commit()

    logger.info("Table deleted", table_id=str(table_id), number=table.table_number)
