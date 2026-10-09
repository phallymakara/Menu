from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.permissions import (
    Permission,
    require_permission_for_writes,
)
from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.inventory import (
    BranchStockAdjustRequest,
    BranchStockResponse,
    InventoryItemCreate,
    InventoryItemResponse,
    LowStockAlertResponse,
)
from app.services.inventory_service import (
    adjust_branch_stock,
    create_inventory_item,
    get_branch_stock_levels,
    get_inventory_items,
    get_low_stock_alerts,
)

router = APIRouter(
    prefix="/businesses/{business_id}/inventory",
    tags=["Multi-Branch Inventory"],
    dependencies=[Depends(require_permission_for_writes(Permission.MANAGE_INVENTORY))],
)


@router.get(
    "/items",
    response_model=list[InventoryItemResponse],
    summary="List master inventory items for a business",
)
async def list_inventory_items_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[InventoryItemResponse]:
    """Lists all organization-wide master inventory items."""
    return await get_inventory_items(
        session=session,
        tenant=tenant,
        business_id=business_id,
    )


@router.post(
    "/items",
    response_model=InventoryItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new master inventory item",
)
async def create_inventory_item_endpoint(
    business_id: UUID,
    payload: InventoryItemCreate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InventoryItemResponse:
    """Creates a new inventory item and seeds branch stock balances."""
    try:
        return await create_inventory_item(
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
    "/branches/{branch_id}/stock",
    response_model=list[BranchStockResponse],
    summary="Get real-time stock balances for a branch",
)
async def get_branch_stock_endpoint(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[BranchStockResponse]:
    """Retrieves all stock balances and low-stock indicators for a specific branch."""
    return await get_branch_stock_levels(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
    )


@router.post(
    "/branches/{branch_id}/stock/adjust",
    response_model=BranchStockResponse,
    summary="Adjust stock balance (audit, restock, spoilage/waste)",
)
async def adjust_branch_stock_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payload: BranchStockAdjustRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BranchStockResponse:
    """Manually updates stock counts and logs an immutable audit event."""
    try:
        return await adjust_branch_stock(
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
    "/alerts/low-stock",
    response_model=LowStockAlertResponse,
    summary="Get low-stock item alerts across all branches",
)
async def get_low_stock_alerts_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    branch_id: Annotated[UUID | None, Query()] = None,
) -> LowStockAlertResponse:
    """Identifies items where branch quantity is at or below the reorder threshold."""
    return await get_low_stock_alerts(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
    )
