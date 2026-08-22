from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.inventory import (
    BranchStockAdjustRequest,
    BranchStockResponse,
    InventoryItemCreate,
    InventoryItemResponse,
    LowStockAlertResponse,
    StockTransferCreateRequest,
    StockTransferResponse,
)
from app.services.inventory_service import (
    adjust_branch_stock,
    approve_stock_transfer,
    create_inventory_item,
    create_stock_transfer,
    dispatch_stock_transfer,
    get_branch_stock_levels,
    get_inventory_items,
    get_low_stock_alerts,
    get_stock_transfers,
    receive_stock_transfer,
)

router = APIRouter(
    prefix="/businesses/{business_id}/inventory",
    tags=["Multi-Branch Inventory & Stock Transfers"],
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
    return await create_inventory_item(
        session=session,
        tenant=tenant,
        business_id=business_id,
        payload=payload,
    )


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
    return await adjust_branch_stock(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        payload=payload,
    )


@router.get(
    "/transfers",
    response_model=list[StockTransferResponse],
    summary="List inter-branch stock transfers",
)
async def list_stock_transfers_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    branch_id: Annotated[UUID | None, Query()] = None,
) -> list[StockTransferResponse]:
    """Lists stock transfers filtered by branch or business."""
    return await get_stock_transfers(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
    )


@router.post(
    "/transfers",
    response_model=StockTransferResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an inter-branch stock transfer request",
)
async def create_stock_transfer_endpoint(
    business_id: UUID,
    payload: StockTransferCreateRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StockTransferResponse:
    """Requests stock to be moved from a source branch to destination branch."""
    return await create_stock_transfer(
        session=session,
        tenant=tenant,
        business_id=business_id,
        payload=payload,
    )


@router.post(
    "/transfers/{transfer_id}/approve",
    response_model=StockTransferResponse,
    summary="Approve a stock transfer request",
)
async def approve_stock_transfer_endpoint(
    business_id: UUID,
    transfer_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StockTransferResponse:
    """Approves a transfer request by source branch manager or General Manager."""
    return await approve_stock_transfer(
        session=session,
        tenant=tenant,
        business_id=business_id,
        transfer_id=transfer_id,
    )


@router.post(
    "/transfers/{transfer_id}/dispatch",
    response_model=StockTransferResponse,
    summary="Dispatch a stock transfer (marks IN_TRANSIT & deducts source stock)",
)
async def dispatch_stock_transfer_endpoint(
    business_id: UUID,
    transfer_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StockTransferResponse:
    """Dispatches shipment and automatically decrements stock at source branch."""
    return await dispatch_stock_transfer(
        session=session,
        tenant=tenant,
        business_id=business_id,
        transfer_id=transfer_id,
    )


@router.post(
    "/transfers/{transfer_id}/receive",
    response_model=StockTransferResponse,
    summary="Receive a stock transfer (marks COMPLETED & increments destination stock)",
)
async def receive_stock_transfer_endpoint(
    business_id: UUID,
    transfer_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> StockTransferResponse:
    """Receives shipment and automatically increments stock at destination branch."""
    return await receive_stock_transfer(
        session=session,
        tenant=tenant,
        business_id=business_id,
        transfer_id=transfer_id,
    )


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
