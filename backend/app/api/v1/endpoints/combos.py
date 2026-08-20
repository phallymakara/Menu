from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.combo import (
    ComboCreate,
    ComboDetailResponse,
    ComboGroupCreate,
    ComboPaginationResponse,
    ComboUpdate,
)
from app.services.combo_service import (
    create_combo,
    create_combo_group,
    delete_combo,
    delete_combo_group,
    get_combo,
    list_combos,
    update_combo,
)

logger = structlog.get_logger("app.api.v1.endpoints.combos")

router = APIRouter(
    prefix="/businesses/{business_id}/combos",
    tags=["Combos & Set Menus"],
)


@router.post(
    "",
    response_model=ComboDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_combo_endpoint(
    business_id: UUID,
    payload: ComboCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ComboDetailResponse:
    """
    Create a new combo bundle with nested choice groups and eligible items.
    """
    try:
        return await create_combo(
            session=session,
            tenant=tenant,
            business_id=business_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "",
    response_model=ComboPaginationResponse,
    status_code=status.HTTP_200_OK,
)
async def list_combos_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    is_active: Annotated[
        bool | None,
        Query(description="Filter by active status"),
    ] = None,
    search: Annotated[
        str | None,
        Query(description="Search combos by name or SKU"),
    ] = None,
    page: Annotated[
        int,
        Query(ge=1, description="Page number"),
    ] = 1,
    page_size: Annotated[
        int,
        Query(ge=1, le=100, description="Items per page"),
    ] = 20,
) -> ComboPaginationResponse:
    """
    List all combo bundles for a business with pagination.
    """
    try:
        return await list_combos(
            session=session,
            tenant=tenant,
            business_id=business_id,
            is_active=is_active,
            search=search,
            page=page,
            page_size=page_size,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/{combo_id}",
    response_model=ComboDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def get_combo_endpoint(
    business_id: UUID,
    combo_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ComboDetailResponse:
    """
    Get detailed combo bundle including choice groups and item options.
    """
    try:
        return await get_combo(
            session=session,
            tenant=tenant,
            business_id=business_id,
            combo_id=combo_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{combo_id}",
    response_model=ComboDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def update_combo_endpoint(
    business_id: UUID,
    combo_id: UUID,
    payload: ComboUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ComboDetailResponse:
    """
    Partially update a combo bundle.
    """
    try:
        return await update_combo(
            session=session,
            tenant=tenant,
            business_id=business_id,
            combo_id=combo_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{combo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_combo_endpoint(
    business_id: UUID,
    combo_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Delete a combo bundle and its choice groups.
    """
    try:
        await delete_combo(
            session=session,
            tenant=tenant,
            business_id=business_id,
            combo_id=combo_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/{combo_id}/groups",
    response_model=ComboDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_combo_group_endpoint(
    business_id: UUID,
    combo_id: UUID,
    payload: ComboGroupCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ComboDetailResponse:
    """
    Add a new choice group to an existing combo bundle.
    """
    try:
        return await create_combo_group(
            session=session,
            tenant=tenant,
            business_id=business_id,
            combo_id=combo_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{combo_id}/groups/{group_id}",
    response_model=ComboDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_combo_group_endpoint(
    business_id: UUID,
    combo_id: UUID,
    group_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ComboDetailResponse:
    """
    Delete a choice group from a combo bundle.
    """
    try:
        return await delete_combo_group(
            session=session,
            tenant=tenant,
            business_id=business_id,
            combo_id=combo_id,
            group_id=group_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
