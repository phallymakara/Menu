from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.item_variant import (
    ItemVariantBatchCreate,
    ItemVariantCreate,
    ItemVariantResponse,
    ItemVariantUpdate,
)
from app.services.item_variant_service import (
    create_batch_variants,
    create_variant,
    delete_variant,
    get_variant,
    list_variants,
    update_variant,
)

logger = structlog.get_logger("app.api.v1.endpoints.item_variants")

router = APIRouter(
    prefix="/businesses/{business_id}/items/{item_id}/variants",
    tags=["Item Variants & Sizes"],
)


@router.post(
    "",
    response_model=ItemVariantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_item_variant_endpoint(
    business_id: UUID,
    item_id: UUID,
    payload: ItemVariantCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ItemVariantResponse:
    """
    Create a single variant for a menu item.
    """
    try:
        variant = await create_variant(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
            payload=payload,
        )
        return ItemVariantResponse.model_validate(variant)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/batch",
    response_model=list[ItemVariantResponse],
    status_code=status.HTTP_201_CREATED,
)
async def create_batch_variants_endpoint(
    business_id: UUID,
    item_id: UUID,
    payload: ItemVariantBatchCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ItemVariantResponse]:
    """
    Batch create multiple variants for a menu item.
    """
    try:
        variants = await create_batch_variants(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
            payload=payload,
        )
        return [ItemVariantResponse.model_validate(v) for v in variants]
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "",
    response_model=list[ItemVariantResponse],
    status_code=status.HTTP_200_OK,
)
async def list_item_variants_endpoint(
    business_id: UUID,
    item_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ItemVariantResponse]:
    """
    List all variants for a menu item.
    """
    try:
        variants = await list_variants(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
        )
        return [ItemVariantResponse.model_validate(v) for v in variants]
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/{variant_id}",
    response_model=ItemVariantResponse,
    status_code=status.HTTP_200_OK,
)
async def get_item_variant_endpoint(
    business_id: UUID,
    item_id: UUID,
    variant_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ItemVariantResponse:
    """
    Get a single variant by ID.
    """
    try:
        variant = await get_variant(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
            variant_id=variant_id,
        )
        return ItemVariantResponse.model_validate(variant)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{variant_id}",
    response_model=ItemVariantResponse,
    status_code=status.HTTP_200_OK,
)
async def update_item_variant_endpoint(
    business_id: UUID,
    item_id: UUID,
    variant_id: UUID,
    payload: ItemVariantUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ItemVariantResponse:
    """
    Partially update an item variant.
    """
    try:
        variant = await update_variant(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
            variant_id=variant_id,
            payload=payload,
        )
        return ItemVariantResponse.model_validate(variant)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_item_variant_endpoint(
    business_id: UUID,
    item_id: UUID,
    variant_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Delete an item variant.
    """
    try:
        await delete_variant(
            session=session,
            tenant=tenant,
            business_id=business_id,
            item_id=item_id,
            variant_id=variant_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
