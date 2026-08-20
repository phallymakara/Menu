from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.enums import TableSessionStatus, TableStatus
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.schemas.table_session import (
    TableMergeRequest,
    TableSessionResponse,
    TableTransferRequest,
    TableUnmergeRequest,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.table_transfer_service")


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


async def transfer_table(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    source_table_id: UUID,
    payload: TableTransferRequest,
    tenant: TenantContext | None = None,
) -> TableSessionResponse:
    """
    Transfers an active dining session from source table to target table.
    """
    if source_table_id == payload.target_table_id:
        raise ResourceConflictError("Source and target tables cannot be the same.")

    # 1. Verify and load source table
    src_query = select(RestaurantTable).where(
        RestaurantTable.id == source_table_id,
        RestaurantTable.branch_id == branch_id,
        RestaurantTable.business_id == business_id,
    )
    if tenant:
        src_query = src_query.where(
            RestaurantTable.organization_id == tenant.organization_id
        )
    src_res = await session.execute(src_query)
    src_table = src_res.scalar_one_or_none()
    if src_table is None:
        raise TenantNotFoundError("Source table not found.")

    # 2. Verify and load target table
    tgt_query = select(RestaurantTable).where(
        RestaurantTable.id == payload.target_table_id,
        RestaurantTable.branch_id == branch_id,
        RestaurantTable.business_id == business_id,
    )
    if tenant:
        tgt_query = tgt_query.where(
            RestaurantTable.organization_id == tenant.organization_id
        )
    tgt_res = await session.execute(tgt_query)
    tgt_table = tgt_res.scalar_one_or_none()
    if tgt_table is None:
        raise TenantNotFoundError("Target table not found.")

    if tgt_table.status == TableStatus.OCCUPIED:
        raise ResourceConflictError("Target table is already occupied.")

    # 3. Find active session on source table
    sess_res = await session.execute(
        select(TableSession).where(
            TableSession.table_id == source_table_id,
            TableSession.status.in_(
                [TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED]
            ),
        )
    )
    sess_obj = sess_res.scalar_one_or_none()
    if sess_obj is None:
        raise TenantNotFoundError("No active session found on source table.")

    # 4. Transfer session
    sess_obj.table_id = tgt_table.id
    if payload.reason:
        transfer_msg = f"Transferred from {src_table.table_number}: {payload.reason}"
        sess_obj.notes = (
            f"{sess_obj.notes}; {transfer_msg}" if sess_obj.notes else transfer_msg
        )

    tgt_table.status = TableStatus.OCCUPIED
    if payload.auto_clean_source:
        src_table.status = TableStatus.DIRTY_CLEANING

    await session.commit()
    await session.refresh(sess_obj)
    await session.refresh(tgt_table)
    await session.refresh(src_table)

    if tenant:
        await record_audit_log(
            session=session,
            action="TABLE_TRANSFERRED",
            organization_id=src_table.organization_id,
            user_id=tenant.user_id,
            resource_type="table_session",
            resource_id=str(sess_obj.id),
            details={
                "source_table": src_table.table_number,
                "target_table": tgt_table.table_number,
                "session_code": sess_obj.session_code,
                "reason": payload.reason,
            },
        )
        await session.commit()

    logger.info(
        "Table session transferred",
        source=src_table.table_number,
        target=tgt_table.table_number,
        session_code=sess_obj.session_code,
    )
    return _map_session_to_response(sess_obj, tgt_table.table_number)


async def merge_tables(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    primary_table_id: UUID,
    payload: TableMergeRequest,
    tenant: TenantContext | None = None,
) -> TableSessionResponse:
    """
    Merges secondary tables into a primary table dining session.
    """
    if primary_table_id in payload.secondary_table_ids:
        raise ResourceConflictError("Primary table cannot be in secondary tables list.")

    # 1. Load primary table and active session
    pri_query = select(RestaurantTable).where(
        RestaurantTable.id == primary_table_id,
        RestaurantTable.branch_id == branch_id,
        RestaurantTable.business_id == business_id,
    )
    if tenant:
        pri_query = pri_query.where(
            RestaurantTable.organization_id == tenant.organization_id
        )
    pri_res = await session.execute(pri_query)
    pri_table = pri_res.scalar_one_or_none()
    if pri_table is None:
        raise TenantNotFoundError("Primary table not found.")

    # Find or open active session on primary table
    sess_res = await session.execute(
        select(TableSession).where(
            TableSession.table_id == primary_table_id,
            TableSession.status.in_(
                [TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED]
            ),
        )
    )
    primary_session = sess_res.scalar_one_or_none()
    if primary_session is None:
        # Auto-open primary session
        primary_session = TableSession(
            organization_id=pri_table.organization_id,
            business_id=business_id,
            branch_id=branch_id,
            table_id=primary_table_id,
            session_code=_generate_session_code(),
            guest_count=1,
            status=TableSessionStatus.ACTIVE,
            opened_by_user_id=tenant.user_id if tenant else None,
            opened_by_type="staff",
        )
        pri_table.status = TableStatus.OCCUPIED
        session.add(primary_session)
        await session.flush()

    merged_table_ids: list[UUID] = []
    merged_table_numbers: list[str] = []

    # 2. Process secondary tables
    for sec_id in payload.secondary_table_ids:
        sec_query = select(RestaurantTable).where(
            RestaurantTable.id == sec_id,
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
        )
        if tenant:
            sec_query = sec_query.where(
                RestaurantTable.organization_id == tenant.organization_id
            )
        sec_res = await session.execute(sec_query)
        sec_table = sec_res.scalar_one_or_none()
        if sec_table is None:
            continue

        # Look for existing active session on secondary table
        sec_sess_res = await session.execute(
            select(TableSession).where(
                TableSession.table_id == sec_id,
                TableSession.status.in_(
                    [TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED]
                ),
            )
        )
        sec_sess = sec_sess_res.scalar_one_or_none()
        if sec_sess:
            sec_sess.parent_session_id = primary_session.id
            sec_sess.status = TableSessionStatus.MERGED
        else:
            child_sess = TableSession(
                organization_id=sec_table.organization_id,
                business_id=business_id,
                branch_id=branch_id,
                table_id=sec_id,
                parent_session_id=primary_session.id,
                session_code=_generate_session_code(),
                guest_count=1,
                status=TableSessionStatus.MERGED,
                opened_by_user_id=tenant.user_id if tenant else None,
                opened_by_type="staff",
            )
            session.add(child_sess)

        sec_table.status = TableStatus.OCCUPIED
        merged_table_ids.append(sec_table.id)
        merged_table_numbers.append(sec_table.table_number)

    if payload.notes:
        primary_session.notes = (
            f"{primary_session.notes}; {payload.notes}"
            if primary_session.notes
            else payload.notes
        )

    await session.commit()
    await session.refresh(primary_session)

    if tenant:
        await record_audit_log(
            session=session,
            action="TABLES_MERGED",
            organization_id=pri_table.organization_id,
            user_id=tenant.user_id,
            resource_type="table_session",
            resource_id=str(primary_session.id),
            details={
                "primary_table": pri_table.table_number,
                "merged_tables": merged_table_numbers,
                "notes": payload.notes,
            },
        )
        await session.commit()

    logger.info(
        "Tables merged into primary session",
        primary=pri_table.table_number,
        merged=merged_table_numbers,
    )
    return _map_session_to_response(
        primary_session,
        pri_table.table_number,
        merged_table_ids=merged_table_ids,
        merged_table_numbers=merged_table_numbers,
    )


async def unmerge_tables(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    primary_table_id: UUID,
    payload: TableUnmergeRequest,
    tenant: TenantContext | None = None,
) -> TableSessionResponse:
    """
    Detaches secondary tables from a primary table merged group.
    """
    pri_query = select(RestaurantTable).where(
        RestaurantTable.id == primary_table_id,
        RestaurantTable.branch_id == branch_id,
        RestaurantTable.business_id == business_id,
    )
    if tenant:
        pri_query = pri_query.where(
            RestaurantTable.organization_id == tenant.organization_id
        )
    pri_res = await session.execute(pri_query)
    pri_table = pri_res.scalar_one_or_none()
    if pri_table is None:
        raise TenantNotFoundError("Primary table not found.")

    # Find active primary session
    sess_res = await session.execute(
        select(TableSession).where(
            TableSession.table_id == primary_table_id,
            TableSession.status.in_(
                [TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED]
            ),
        )
    )
    primary_session = sess_res.scalar_one_or_none()
    if primary_session is None:
        raise TenantNotFoundError("No active session found on primary table.")

    # Detach secondary tables
    unmerged_table_numbers: list[str] = []
    for sec_id in payload.secondary_table_ids:
        sec_query = select(RestaurantTable).where(
            RestaurantTable.id == sec_id,
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
        )
        if tenant:
            sec_query = sec_query.where(
                RestaurantTable.organization_id == tenant.organization_id
            )
        sec_res = await session.execute(sec_query)
        sec_table = sec_res.scalar_one_or_none()
        if sec_table is None:
            continue

        # Find child session
        child_sess_res = await session.execute(
            select(TableSession).where(
                TableSession.table_id == sec_id,
                TableSession.parent_session_id == primary_session.id,
            )
        )
        child_sess = child_sess_res.scalar_one_or_none()
        if child_sess:
            child_sess.parent_session_id = None
            child_sess.status = TableSessionStatus.COMPLETED
            child_sess.closed_at = datetime.now(timezone.utc)

        sec_table.status = TableStatus.AVAILABLE
        unmerged_table_numbers.append(sec_table.table_number)

    await session.commit()
    await session.refresh(primary_session)

    if tenant:
        await record_audit_log(
            session=session,
            action="TABLES_UNMERGED",
            organization_id=pri_table.organization_id,
            user_id=tenant.user_id,
            resource_type="table_session",
            resource_id=str(primary_session.id),
            details={
                "primary_table": pri_table.table_number,
                "unmerged_tables": unmerged_table_numbers,
            },
        )
        await session.commit()

    logger.info(
        "Tables unmerged from primary session",
        primary=pri_table.table_number,
        unmerged=unmerged_table_numbers,
    )
    return _map_session_to_response(primary_session, pri_table.table_number)
