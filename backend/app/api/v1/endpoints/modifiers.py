from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.modifier import (
    AssignModifierGroupsRequest,
    ModifierGroupCreate,
    ModifierGroupDetailResponse,
    ModifierGroupUpdate,
    ModifierOptionCreate,
    ModifierOptionResponse,
    ModifierOptionUpdate,
)
from app.services.modifier_service import (
    assign_modifier_groups_to_item,
    create_modifier_group,
    create_modifier_option,
    delete_modifier_group,
    delete_modifier_option,
    get_item_modifier_groups,
    get_modifier_group,
    list_modifier_groups,
    update_modifier_group,
    update_modifier_option,
)

logger = structlog.get_logger("app.api.v1.endpoints.modifiers")

router = APIRouter(
    prefix="/businesses/{business_id}",
    tags=["Modifier Groups & Add-ons"],
)


# --- Modifier Groups Endpoints ---


@router.post(
    "/modifier-groups",
    response_model=ModifierGroupDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_modifier_group_endpoint(
    business_id: UUID,
    payload: ModifierGroupCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ModifierGroupDetailResponse:
    """
    Create a new reusable modifier group for a business.
    """
    try:
        group = await create_modifier_group(
            session=session,
            tenant=tenant,
            business_id=business_id,
            payload=payload,
        )
        return ModifierGroupDetailResponse(
            id=group.id,
            organization_id=group.organization_id,
            business_id=group.business_id,
            name_en=group.name_en,
            name_km=group.name_km,
            description_en=group.description_en,
            description_km=group.description_km,
            min_selections=group.min_selections,
            max_selections=group.max_selections,
            display_order=group.display_order,
            is_active=group.is_active,
            created_at=group.created_at,
            updated_at=group.updated_at,
            options=[
                ModifierOptionResponse.model_validate(opt) for opt in group.options
            ],
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/modifier-groups",
    response_model=list[ModifierGroupDetailResponse],
    status_code=status.HTTP_200_OK,
)
async def list_modifier_groups_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    is_active: Annotated[
        bool | None,
        Query(description="Filter by active status"),
    ] = None,
) -> list[ModifierGroupDetailResponse]:
    """
    List all modifier groups with options for a business.
    """
    try:
        return await list_modifier_groups(
            session=session,
            tenant=tenant,
            business_id=business_id,
            is_active=is_active,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/modifier-groups/{group_id}",
    response_model=ModifierGroupDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def get_modifier_group_endpoint(
    business_id: UUID,
    group_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ModifierGroupDetailResponse:
    """
    Get a single modifier group by ID.
    """
    try:
        group = await get_modifier_group(
            session=session,
            tenant=tenant,
            business_id=business_id,
            group_id=group_id,
        )
        return ModifierGroupDetailResponse(
            id=group.id,
            organization_id=group.organization_id,
            business_id=group.business_id,
            name_en=group.name_en,
            name_km=group.name_km,
            description_en=group.description_en,
            description_km=group.description_km,
            min_selections=group.min_selections,
            max_selections=group.max_selections,
            display_order=group.display_order,
            is_active=group.is_active,
            created_at=group.created_at,
            updated_at=group.updated_at,
            options=[
                ModifierOptionResponse.model_validate(opt) for opt in group.options
            ],
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/modifier-groups/{group_id}",
    response_model=ModifierGroupDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def update_modifier_group_endpoint(
    business_id: UUID,
    group_id: UUID,
    payload: ModifierGroupUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ModifierGroupDetailResponse:
    """
    Partially update a modifier group.
    """
    try:
        group = await update_modifier_group(
            session=session,
            tenant=tenant,
            business_id=business_id,
            group_id=group_id,
            payload=payload,
        )
        return ModifierGroupDetailResponse(
            id=group.id,
            organization_id=group.organization_id,
            business_id=group.business_id,
            name_en=group.name_en,
            name_km=group.name_km,
            description_en=group.description_en,
            description_km=group.description_km,
            min_selections=group.min_selections,
            max_selections=group.max_selections,
            display_order=group.display_order,
            is_active=group.is_active,
            created_at=group.created_at,
            updated_at=group.updated_at,
            options=[
                ModifierOptionResponse.model_validate(opt) for opt in group.options
            ],
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete(
    "/modifier-groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_modifier_group_endpoint(
    business_id: UUID,
    group_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Delete a modifier group and its options.
    """
    try:
        await delete_modifier_group(
            session=session,
            tenant=tenant,
            business_id=business_id,
            group_id=group_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


# --- Modifier Options Endpoints ---


@router.post(
    "/modifier-groups/{group_id}/options",
    response_model=ModifierOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_modifier_option_endpoint(
    business_id: UUID,
    group_id: UUID,
    payload: ModifierOptionCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ModifierOptionResponse:
    """
    Create a new option / add-on in a modifier group.
    """
    try:
        option = await create_modifier_option(
            session=session,
            tenant=tenant,
            business_id=business_id,
            group_id=group_id,
            payload=payload,
        )
        return ModifierOptionResponse.model_validate(option)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/modifier-groups/{group_id}/options/{option_id}",
    response_model=ModifierOptionResponse,
    status_code=status.HTTP_200_OK,
)
async def update_modifier_option_endpoint(
    business_id: UUID,
    group_id: UUID,
    option_id: UUID,
    payload: ModifierOptionUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ModifierOptionResponse:
    """
    Partially update a modifier option.
    """
    try:
        option = await update_modifier_option(
            session=session,
            tenant=tenant,
            business_id=business_id,
            group_id=group_id,
            option_id=option_id,
            payload=payload,
        )
        return ModifierOptionResponse.model_validate(option)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete(
    "/modifier-groups/{group_id}/options/{option_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_modifier_option_endpoint(
    business_id: UUID,
    group_id: UUID,
    option_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Delete a modifier option.
    """
    try:
        await delete_modifier_option(
            session=session,
            tenant=tenant,
            business_id=business_id,
            group_id=group_id,
            option_id=option_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


# --- Menu Item Modifier Group Links ---


@router.post(
    "/items/{item_id}/modifier-groups",
    response_model=list[ModifierGroupDetailResponse],
    status_code=status.HTTP_200_OK,
)
async def assign_item_modifier_groups_endpoint(
    business_id: UUID,
    item_id: UUID,
    payload: AssignModifierGroupsRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ModifierGroupDetailResponse]:
    """
    Assign a list of modifier groups to a menu item.
    """
    try:
        return await assign_modifier_groups_to_item(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/items/{item_id}/modifier-groups",
    response_model=list[ModifierGroupDetailResponse],
    status_code=status.HTTP_200_OK,
)
async def get_item_modifier_groups_endpoint(
    business_id: UUID,
    item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ModifierGroupDetailResponse]:
    """
    Get all modifier groups and options assigned to a menu item.
    """
    try:
        return await get_item_modifier_groups(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
