from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.restaurant_table import (
    RestaurantTableBatchCreate,
    RestaurantTableCreate,
    RestaurantTableResponse,
    RestaurantTableStatusUpdate,
    RestaurantTableUpdate,
)
from app.services.restaurant_table_service import (
    batch_create_tables,
    create_table,
    delete_table,
    get_table,
    list_tables,
    update_table,
    update_table_status,
)

logger = structlog.get_logger("app.api.v1.endpoints.restaurant_tables")

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/tables",
    tags=["Restaurant Tables & Seating"],
)


@router.post(
    "",
    response_model=RestaurantTableResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_table_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: RestaurantTableCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RestaurantTableResponse:
    """
    Create a new restaurant table in a branch.
    """
    try:
        return await create_table(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
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
    "/batch",
    response_model=list[RestaurantTableResponse],
    status_code=status.HTTP_201_CREATED,
)
async def batch_create_tables_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: RestaurantTableBatchCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[RestaurantTableResponse]:
    """
    Generate a sequential batch range of tables for a branch.
    """
    try:
        return await batch_create_tables(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "",
    response_model=list[RestaurantTableResponse],
    status_code=status.HTTP_200_OK,
)
async def list_tables_endpoint(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    dining_area_id: Annotated[
        UUID | None,
        Query(description="Filter by dining area / zone ID"),
    ] = None,
    table_status: Annotated[
        str | None,
        Query(alias="status", description="Filter by operational status"),
    ] = None,
    is_active: Annotated[
        bool | None,
        Query(description="Filter by active visibility"),
    ] = None,
) -> list[RestaurantTableResponse]:
    """
    List all tables for a branch with optional filters.
    """
    try:
        return await list_tables(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            dining_area_id=dining_area_id,
            status=table_status,
            is_active=is_active,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/{table_id}",
    response_model=RestaurantTableResponse,
    status_code=status.HTTP_200_OK,
)
async def get_table_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RestaurantTableResponse:
    """
    Get detailed table configuration by ID.
    """
    try:
        return await get_table(
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


@router.patch(
    "/{table_id}",
    response_model=RestaurantTableResponse,
    status_code=status.HTTP_200_OK,
)
async def update_table_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: RestaurantTableUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RestaurantTableResponse:
    """
    Partially update table configuration.
    """
    try:
        return await update_table(
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


@router.patch(
    "/{table_id}/status",
    response_model=RestaurantTableResponse,
    status_code=status.HTTP_200_OK,
)
async def update_table_status_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    payload: RestaurantTableStatusUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RestaurantTableResponse:
    """
    Quickly transition a table's operational status.
    """
    try:
        return await update_table_status(
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


@router.delete(
    "/{table_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_table_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Delete a restaurant table from a branch.
    """
    try:
        await delete_table(
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
