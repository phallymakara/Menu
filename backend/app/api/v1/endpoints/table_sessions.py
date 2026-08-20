from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.table_session import (
    BranchTableLiveDashboardResponse,
    TableMergeRequest,
    TableSessionCloseRequest,
    TableSessionOpenRequest,
    TableSessionResponse,
    TableTransferRequest,
    TableUnmergeRequest,
)
from app.services.table_session_service import (
    close_table_session,
    get_active_table_session,
    get_live_table_dashboard,
    open_table_session,
    request_session_bill,
)
from app.services.table_transfer_service import (
    merge_tables,
    transfer_table,
    unmerge_tables,
)

logger = structlog.get_logger("app.api.v1.endpoints.table_sessions")

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}",
    tags=["Table Sessions & Live Dashboard"],
)


@router.get(
    "/tables-dashboard",
    response_model=BranchTableLiveDashboardResponse,
    status_code=status.HTTP_200_OK,
)
async def get_tables_dashboard_endpoint(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    dining_area_id: Annotated[
        UUID | None,
        Query(description="Optional filter by dining area ID"),
    ] = None,
) -> BranchTableLiveDashboardResponse:
    """
    Real-time table floor dashboard for hostesses, waiters, and cashiers.
    """
    try:
        return await get_live_table_dashboard(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            dining_area_id=dining_area_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/tables/{table_id}/sessions/open",
    response_model=TableSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def open_table_session_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: TableSessionOpenRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionResponse:
    """
    Open or start a dining session for a table (staff POS or tablet).
    """
    try:
        return await open_table_session(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            table_id=table_id,
            payload=payload,
            opened_by_type="staff",
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/tables/{table_id}/sessions/active",
    response_model=TableSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def get_active_table_session_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionResponse:
    """
    Get the current active dining session for a table.
    """
    try:
        return await get_active_table_session(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            table_id=table_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/tables/{table_id}/sessions/request-bill",
    response_model=TableSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def request_session_bill_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionResponse:
    """
    Mark table session as bill_requested.
    """
    try:
        return await request_session_bill(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            table_id=table_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/tables/{table_id}/sessions/close",
    response_model=TableSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def close_table_session_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: TableSessionCloseRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionResponse:
    """
    Close and complete a table dining session (and auto-rotate QR token).
    """
    try:
        return await close_table_session(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            table_id=table_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/tables/{table_id}/transfer",
    response_model=TableSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def transfer_table_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: TableTransferRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionResponse:
    """
    Transfer an active dining session and its history to another table.
    """
    try:
        return await transfer_table(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            source_table_id=table_id,
            payload=payload,
        )
    except ResourceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/tables/{table_id}/merge",
    response_model=TableSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def merge_tables_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: TableMergeRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionResponse:
    """
    Merge secondary tables into a primary table dining session.
    """
    try:
        return await merge_tables(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            primary_table_id=table_id,
            payload=payload,
        )
    except ResourceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/tables/{table_id}/unmerge",
    response_model=TableSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def unmerge_tables_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: TableUnmergeRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionResponse:
    """
    Detach secondary tables from a primary table merged group.
    """
    try:
        return await unmerge_tables(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            primary_table_id=table_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
