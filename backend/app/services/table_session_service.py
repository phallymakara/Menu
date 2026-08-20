from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.dining_area import DiningArea
from app.models.enums import TableSessionStatus, TableShape, TableStatus
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.schemas.table_session import (
    BranchTableLiveDashboardResponse,
    DashboardAreaGroup,
    DashboardTableItem,
    TableSessionCloseRequest,
    TableSessionOpenRequest,
    TableSessionResponse,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.table_session_service")


def _generate_session_code() -> str:
    """Generates a friendly unique session code (e.g. S-A1B2C3)."""
    return f"S-{secrets.token_hex(3).upper()}"


def _map_session_to_response(
    sess: TableSession,
    table_number: str,
    merged_table_ids: list[UUID] | None = None,
    merged_table_numbers: list[str] | None = None,
) -> TableSessionResponse:
    """Calculates duration and maps TableSession ORM to response schema."""
    now_utc = datetime.now(timezone.utc)
    opened = (
        sess.opened_at
        if sess.opened_at.tzinfo
        else sess.opened_at.replace(tzinfo=timezone.utc)
    )
    end_time = sess.closed_at if sess.closed_at else now_utc
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    duration_minutes = max(0, int((end_time - opened).total_seconds() // 60))

    return TableSessionResponse(
        id=sess.id,
        session_code=sess.session_code,
        organization_id=sess.organization_id,
        business_id=sess.business_id,
        branch_id=sess.branch_id,
        table_id=sess.table_id,
        table_number=table_number,
        guest_count=sess.guest_count,
        status=sess.status,  # type: ignore[arg-type]
        opened_by_type=sess.opened_by_type,
        opened_at=sess.opened_at,
        bill_requested_at=sess.bill_requested_at,
        closed_at=sess.closed_at,
        duration_minutes=duration_minutes,
        notes=sess.notes,
        session_token=sess.session_token,
        parent_session_id=sess.parent_session_id,
        merged_table_ids=merged_table_ids or [],
        merged_table_numbers=merged_table_numbers or [],
        created_at=sess.created_at,
    )


async def open_table_session(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: TableSessionOpenRequest,
    tenant: TenantContext | None = None,
    opened_by_type: str = "staff",
    user_id: UUID | None = None,
) -> TableSessionResponse:
    """
    Opens or joins an active dining session for a table.
    """
    tbl_query = select(RestaurantTable).where(
        RestaurantTable.id == table_id,
        RestaurantTable.branch_id == branch_id,
        RestaurantTable.business_id == business_id,
    )
    if tenant:
        tbl_query = tbl_query.where(
            RestaurantTable.organization_id == tenant.organization_id
        )

    res = await session.execute(tbl_query)
    table = res.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    # Check for existing active or bill_requested session
    existing_sess = await session.execute(
        select(TableSession).where(
            TableSession.table_id == table_id,
            TableSession.status.in_(
                [TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED]
            ),
        )
    )
    active_session = existing_sess.scalar_one_or_none()
    if active_session is not None:
        return _map_session_to_response(active_session, table.table_number)

    # Create new session
    sess_obj = TableSession(
        organization_id=table.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_id=table_id,
        session_code=_generate_session_code(),
        guest_count=payload.guest_count,
        status=TableSessionStatus.ACTIVE,
        opened_by_user_id=user_id or (tenant.user_id if tenant else None),
        opened_by_type=opened_by_type,
        notes=payload.notes,
    )
    table.status = TableStatus.OCCUPIED
    session.add(sess_obj)
    await session.commit()
    await session.refresh(sess_obj)

    if tenant:
        await record_audit_log(
            session=session,
            action="TABLE_SESSION_OPENED",
            organization_id=table.organization_id,
            user_id=tenant.user_id,
            resource_type="table_session",
            resource_id=str(sess_obj.id),
            details={
                "table_number": table.table_number,
                "session_code": sess_obj.session_code,
                "guest_count": sess_obj.guest_count,
            },
        )
        await session.commit()

    logger.info(
        "Table session opened",
        session_id=str(sess_obj.id),
        code=sess_obj.session_code,
        table=table.table_number,
    )
    return _map_session_to_response(sess_obj, table.table_number)


async def get_active_table_session(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    tenant: TenantContext | None = None,
) -> TableSessionResponse:
    """
    Retrieves the current active session for a table.
    """
    tbl_query = select(RestaurantTable).where(
        RestaurantTable.id == table_id,
        RestaurantTable.branch_id == branch_id,
        RestaurantTable.business_id == business_id,
    )
    if tenant:
        tbl_query = tbl_query.where(
            RestaurantTable.organization_id == tenant.organization_id
        )

    res = await session.execute(tbl_query)
    table = res.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    sess_res = await session.execute(
        select(TableSession).where(
            TableSession.table_id == table_id,
            TableSession.status.in_(
                [TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED]
            ),
        )
    )
    sess_obj = sess_res.scalar_one_or_none()
    if sess_obj is None:
        raise TenantNotFoundError("No active session found for this table.")

    return _map_session_to_response(sess_obj, table.table_number)


async def request_session_bill(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    tenant: TenantContext | None = None,
) -> TableSessionResponse:
    """
    Transitions the active table session to bill_requested.
    """
    tbl_query = select(RestaurantTable).where(
        RestaurantTable.id == table_id,
        RestaurantTable.branch_id == branch_id,
        RestaurantTable.business_id == business_id,
    )
    if tenant:
        tbl_query = tbl_query.where(
            RestaurantTable.organization_id == tenant.organization_id
        )

    res = await session.execute(tbl_query)
    table = res.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    sess_res = await session.execute(
        select(TableSession).where(
            TableSession.table_id == table_id,
            TableSession.status == TableSessionStatus.ACTIVE,
        )
    )
    sess_obj = sess_res.scalar_one_or_none()
    if sess_obj is None:
        # Check if already in bill_requested
        bill_res = await session.execute(
            select(TableSession).where(
                TableSession.table_id == table_id,
                TableSession.status == TableSessionStatus.BILL_REQUESTED,
            )
        )
        sess_obj = bill_res.scalar_one_or_none()
        if sess_obj is None:
            raise TenantNotFoundError("No active session found to request bill.")
        return _map_session_to_response(sess_obj, table.table_number)

    sess_obj.status = TableSessionStatus.BILL_REQUESTED
    sess_obj.bill_requested_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(sess_obj)

    if tenant:
        await record_audit_log(
            session=session,
            action="TABLE_BILL_REQUESTED",
            organization_id=table.organization_id,
            user_id=tenant.user_id,
            resource_type="table_session",
            resource_id=str(sess_obj.id),
            details={"table_number": table.table_number},
        )
        await session.commit()

    logger.info("Bill requested for session", session_code=sess_obj.session_code)
    return _map_session_to_response(sess_obj, table.table_number)


async def close_table_session(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: TableSessionCloseRequest,
    tenant: TenantContext | None = None,
) -> TableSessionResponse:
    """
    Closes active table session, updates table status, and rotates QR token.
    """
    tbl_query = select(RestaurantTable).where(
        RestaurantTable.id == table_id,
        RestaurantTable.branch_id == branch_id,
        RestaurantTable.business_id == business_id,
    )
    if tenant:
        tbl_query = tbl_query.where(
            RestaurantTable.organization_id == tenant.organization_id
        )

    res = await session.execute(tbl_query)
    table = res.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    sess_res = await session.execute(
        select(TableSession).where(
            TableSession.table_id == table_id,
            TableSession.status.in_(
                [TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED]
            ),
        )
    )
    sess_obj = sess_res.scalar_one_or_none()
    if sess_obj is None:
        raise TenantNotFoundError("No active session found to close.")

    sess_obj.status = TableSessionStatus.COMPLETED
    sess_obj.closed_at = datetime.now(timezone.utc)
    if payload.notes:
        sess_obj.notes = payload.notes

    table.status = str(payload.next_table_status)

    await session.commit()
    await session.refresh(sess_obj)
    await session.refresh(table)

    if tenant:
        await record_audit_log(
            session=session,
            action="TABLE_SESSION_CLOSED",
            organization_id=table.organization_id,
            user_id=tenant.user_id,
            resource_type="table_session",
            resource_id=str(sess_obj.id),
            details={
                "table_number": table.table_number,
                "session_code": sess_obj.session_code,
                "next_status": table.status,
            },
        )
        await session.commit()

    logger.info("Table session closed", session_code=sess_obj.session_code)
    return _map_session_to_response(sess_obj, table.table_number)


async def get_live_table_dashboard(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    dining_area_id: UUID | None = None,
) -> BranchTableLiveDashboardResponse:
    """
    Aggregates real-time floor metrics and active sessions for floor staff.
    """
    branch_res = await session.execute(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.business_id == business_id,
            Branch.organization_id == tenant.organization_id,
        )
    )
    branch = branch_res.scalar_one_or_none()
    if branch is None:
        raise TenantNotFoundError("Branch not found.")

    # Load areas
    area_query = (
        select(DiningArea)
        .where(
            DiningArea.branch_id == branch_id,
            DiningArea.business_id == business_id,
            DiningArea.organization_id == tenant.organization_id,
            DiningArea.is_active.is_(True),
        )
        .order_by(DiningArea.display_order.asc())
    )
    if dining_area_id is not None:
        area_query = area_query.where(DiningArea.id == dining_area_id)

    areas_res = await session.execute(area_query)
    areas = list(areas_res.scalars().all())

    # Load all tables
    tbl_query = (
        select(RestaurantTable)
        .options(
            selectinload(RestaurantTable.dining_area),
            selectinload(RestaurantTable.sessions),
        )
        .where(
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
            RestaurantTable.organization_id == tenant.organization_id,
            RestaurantTable.is_active.is_(True),
        )
        .order_by(
            RestaurantTable.display_order.asc(),
            RestaurantTable.table_number.asc(),
        )
    )
    if dining_area_id is not None:
        tbl_query = tbl_query.where(RestaurantTable.dining_area_id == dining_area_id)

    tbl_res = await session.execute(tbl_query)
    tables = list(tbl_res.scalars().all())

    now_utc = datetime.now(timezone.utc)

    # Counters
    available_count = 0
    occupied_count = 0
    bill_requested_count = 0
    reserved_count = 0
    cleaning_count = 0
    out_of_service_count = 0

    table_items_by_area: dict[UUID | None, list[DashboardTableItem]] = {
        a.id: [] for a in areas
    }
    table_items_by_area[None] = []  # Unassigned area

    for t in tables:
        # Find active session
        active_sess = next(
            (
                s
                for s in t.sessions
                if s.status
                in [TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED]
            ),
            None,
        )

        duration_mins = None
        if active_sess:
            opened = (
                active_sess.opened_at
                if active_sess.opened_at.tzinfo
                else active_sess.opened_at.replace(tzinfo=timezone.utc)
            )
            duration_mins = max(0, int((now_utc - opened).total_seconds() // 60))

        # Check status counters
        if t.status == TableStatus.AVAILABLE:
            available_count += 1
        elif t.status == TableStatus.RESERVED:
            reserved_count += 1
        elif t.status == TableStatus.DIRTY_CLEANING:
            cleaning_count += 1
        elif t.status == TableStatus.OUT_OF_SERVICE:
            out_of_service_count += 1
        else:
            # Table is occupied
            if active_sess and active_sess.status == TableSessionStatus.BILL_REQUESTED:
                bill_requested_count += 1
            else:
                occupied_count += 1

        item = DashboardTableItem(
            table_id=t.id,
            table_number=t.table_number,
            name=t.name,
            shape=TableShape(t.shape),
            status=TableStatus(t.status),
            min_capacity=t.min_capacity,
            max_capacity=t.max_capacity,
            dining_area_id=t.dining_area_id,
            dining_area_name_en=t.dining_area.name_en if t.dining_area else None,
            active_session_id=active_sess.id if active_sess else None,
            active_session_code=active_sess.session_code if active_sess else None,
            active_session_status=TableSessionStatus(active_sess.status)
            if active_sess
            else None,
            guest_count=active_sess.guest_count if active_sess else None,
            session_opened_at=active_sess.opened_at if active_sess else None,
            duration_minutes=duration_mins,
        )

        if t.dining_area_id in table_items_by_area:
            table_items_by_area[t.dining_area_id].append(item)
        else:
            table_items_by_area[None].append(item)

    area_groups: list[DashboardAreaGroup] = []
    for a in areas:
        area_groups.append(
            DashboardAreaGroup(
                area_id=a.id,
                area_name_en=a.name_en,
                area_name_km=a.name_km,
                tables=table_items_by_area.get(a.id, []),
            )
        )

    if table_items_by_area.get(None):
        area_groups.append(
            DashboardAreaGroup(
                area_id=None,
                area_name_en="Main / Unassigned Area",
                area_name_km="តំបន់ទូទៅ",
                tables=table_items_by_area[None],
            )
        )

    return BranchTableLiveDashboardResponse(
        branch_id=branch_id,
        branch_name_en=branch.name_en,
        total_tables=len(tables),
        available_count=available_count,
        occupied_count=occupied_count,
        bill_requested_count=bill_requested_count,
        reserved_count=reserved_count,
        cleaning_count=cleaning_count,
        out_of_service_count=out_of_service_count,
        areas=area_groups,
    )
