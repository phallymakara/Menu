from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.dining_area import (
    DiningAreaCreate,
    DiningAreaReorderRequest,
    DiningAreaResponse,
    DiningAreaUpdate,
)
from app.services.dining_area_service import (
    create_dining_area,
    delete_dining_area,
    get_dining_area,
    list_dining_areas,
    reorder_dining_areas,
    update_dining_area,
)

logger = structlog.get_logger("app.api.v1.endpoints.dining_areas")

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/areas",
    tags=["Dining Areas & Spatial Zones"],
)


@router.post(
    "",
    response_model=DiningAreaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_dining_area_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: DiningAreaCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> DiningAreaResponse:
    """
    Create a new dining area / spatial zone for a branch.
    """
    try:
        area = await create_dining_area(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            payload=payload,
        )
        return DiningAreaResponse.model_validate(area)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "",
    response_model=list[DiningAreaResponse],
    status_code=status.HTTP_200_OK,
)
async def list_dining_areas_endpoint(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    is_active: Annotated[
        bool | None,
        Query(description="Filter by active status"),
    ] = None,
) -> list[DiningAreaResponse]:
    """
    List all dining areas / zones for a branch.
    """
    try:
        areas = await list_dining_areas(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            is_active=is_active,
        )
        return [DiningAreaResponse.model_validate(a) for a in areas]
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.put(
    "/reorder",
    response_model=list[DiningAreaResponse],
    status_code=status.HTTP_200_OK,
)
async def reorder_dining_areas_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: DiningAreaReorderRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[DiningAreaResponse]:
    """
    Batch reorder dining areas for floor map display.
    """
    try:
        areas = await reorder_dining_areas(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            payload=payload,
        )
        return [DiningAreaResponse.model_validate(a) for a in areas]
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/{area_id}",
    response_model=DiningAreaResponse,
    status_code=status.HTTP_200_OK,
)
async def get_dining_area_endpoint(
    business_id: UUID,
    branch_id: UUID,
    area_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> DiningAreaResponse:
    """
    Get a single dining area by ID.
    """
    try:
        area = await get_dining_area(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            area_id=area_id,
        )
        return DiningAreaResponse.model_validate(area)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{area_id}",
    response_model=DiningAreaResponse,
    status_code=status.HTTP_200_OK,
)
async def update_dining_area_endpoint(
    business_id: UUID,
    branch_id: UUID,
    area_id: UUID,
    payload: DiningAreaUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> DiningAreaResponse:
    """
    Partially update a dining area.
    """
    try:
        area = await update_dining_area(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            area_id=area_id,
            payload=payload,
        )
        return DiningAreaResponse.model_validate(area)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{area_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_dining_area_endpoint(
    business_id: UUID,
    branch_id: UUID,
    area_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Delete a dining area.
    """
    try:
        await delete_dining_area(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            area_id=area_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
