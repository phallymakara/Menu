from __future__ import annotations

import secrets
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.enums import (
    StockAdjustmentReason,
    UnitOfMeasure,
)
from app.models.inventory import (
    BranchStock,
    InventoryItem,
    StockAdjustmentLog,
)
from app.models.menu_item import MenuItem
from app.schemas.inventory import (
    BranchStockAdjustRequest,
    BranchStockResponse,
    InventoryItemCreate,
    InventoryItemResponse,
    LowStockAlertItem,
    LowStockAlertResponse,
)
from app.services.branch_roaming_service import can_user_roam_branches
from app.services.tenancy import get_branch_for_tenant, get_business_for_tenant

logger = structlog.get_logger("app.services.inventory_service")


def _enforce_inventory_branch_access(tenant: TenantContext, branch_id: UUID) -> None:
    """
    Validates branch access permissions for Inventory operations.
    Brand Owners and General Managers can access any branch.
    Store managers/staff are locked to their assigned branch.
    """
    if can_user_roam_branches(tenant.membership):
        return
    if tenant.membership.branch_id != branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Access denied. You do not have permission to manage "
                "inventory for this branch."
            ),
        )


async def create_inventory_item(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    payload: InventoryItemCreate,
) -> InventoryItemResponse:
    """
    Creates a new inventory master item and initializes stock records
    (0 quantity) for all active branches.

    Raises:
        TenantNotFoundError: If the business, or the linked menu item, is not part
            of the caller's organization.
    """
    await get_business_for_tenant(session, tenant, business_id)

    if payload.menu_item_id is not None:
        menu_item_res = await session.execute(
            select(MenuItem.id).where(
                MenuItem.id == payload.menu_item_id,
                MenuItem.business_id == business_id,
                MenuItem.organization_id == tenant.organization_id,
            )
        )
        if menu_item_res.scalar_one_or_none() is None:
            raise TenantNotFoundError("Menu item not found in this business.")

    item = InventoryItem(
        organization_id=tenant.organization_id,
        business_id=business_id,
        name_en=payload.name_en,
        name_km=payload.name_km,
        sku=payload.sku,
        unit_of_measure=payload.unit_of_measure,
        cost_per_unit_usd=payload.cost_per_unit_usd,
        reorder_threshold=payload.reorder_threshold,
        ideal_stock_quantity=payload.ideal_stock_quantity,
        menu_item_id=payload.menu_item_id,
        is_active=payload.is_active,
    )
    session.add(item)
    await session.flush()

    # Initialize BranchStock for all active branches in the business
    branches_res = await session.execute(
        select(Branch).where(
            Branch.business_id == business_id,
            Branch.organization_id == tenant.organization_id,
            Branch.is_active.is_(True),
        )
    )
    branches = branches_res.scalars().all()
    for br in branches:
        stock = BranchStock(
            organization_id=tenant.organization_id,
            business_id=business_id,
            branch_id=br.id,
            inventory_item_id=item.id,
            quantity=Decimal("0.00"),
            reorder_threshold=payload.reorder_threshold,
            ideal_stock_quantity=payload.ideal_stock_quantity,
        )
        session.add(stock)

    await session.commit()
    await session.refresh(item)

    logger.info("Inventory item created", item_id=str(item.id), name=item.name_en)
    return InventoryItemResponse.model_validate(item)


async def get_inventory_items(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
) -> list[InventoryItemResponse]:
    """Lists all master inventory items for a business."""
    stmt = (
        select(InventoryItem)
        .where(
            InventoryItem.business_id == business_id,
            InventoryItem.organization_id == tenant.organization_id,
        )
        .order_by(InventoryItem.name_en.asc())
    )
    res = await session.execute(stmt)
    items = res.scalars().all()
    return [InventoryItemResponse.model_validate(i) for i in items]


async def get_branch_stock_levels(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
) -> list[BranchStockResponse]:
    """Retrieves all stock items and quantities for a specific branch."""
    _enforce_inventory_branch_access(tenant, branch_id)

    stmt = (
        select(BranchStock)
        .options(
            selectinload(BranchStock.inventory_item), selectinload(BranchStock.branch)
        )
        .where(
            BranchStock.business_id == business_id,
            BranchStock.branch_id == branch_id,
            BranchStock.organization_id == tenant.organization_id,
        )
        .order_by(BranchStock.created_at.asc())
    )
    res = await session.execute(stmt)
    stocks = res.scalars().all()

    response: list[BranchStockResponse] = []
    for s in stocks:
        item = s.inventory_item
        cost = item.cost_per_unit_usd if item else Decimal("0.00")
        total_val = (s.quantity * cost).quantize(Decimal("0.01"))
        is_low = s.quantity <= s.reorder_threshold
        is_out = s.quantity <= 0

        response.append(
            BranchStockResponse(
                id=s.id,
                branch_id=s.branch_id,
                branch_name=s.branch.name_en if s.branch else None,
                inventory_item_id=s.inventory_item_id,
                item_name_en=item.name_en if item else "Unknown",
                item_name_km=item.name_km if item else None,
                sku=item.sku if item else None,
                unit_of_measure=item.unit_of_measure,
                quantity=s.quantity,
                reorder_threshold=s.reorder_threshold,
                ideal_stock_quantity=s.ideal_stock_quantity,
                is_low_stock=is_low,
                is_out_of_stock=is_out,
                cost_per_unit_usd=cost,
                total_stock_value_usd=total_val,
                updated_at=s.updated_at,
            )
        )

    return response


async def adjust_branch_stock(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: BranchStockAdjustRequest,
) -> BranchStockResponse:
    """
    Adjusts current stock level (manual audit, restock, waste/spoilage)
    and writes audit log.

    Raises:
        TenantNotFoundError: If the branch is not part of the business and tenant.
        HTTPException (403): If the caller is locked to another branch.
        HTTPException (404): If the inventory item is not in this business and tenant.
    """
    await get_branch_for_tenant(session, tenant, business_id, branch_id)
    _enforce_inventory_branch_access(tenant, branch_id)

    # Fetch or initialize BranchStock
    stmt = (
        select(BranchStock)
        .options(
            selectinload(BranchStock.inventory_item), selectinload(BranchStock.branch)
        )
        .where(
            BranchStock.organization_id == tenant.organization_id,
            BranchStock.business_id == business_id,
            BranchStock.branch_id == branch_id,
            BranchStock.inventory_item_id == payload.inventory_item_id,
        )
    )
    res = await session.execute(stmt)
    stock = res.scalar_one_or_none()

    if stock is None:
        # Check if item exists
        item_res = await session.execute(
            select(InventoryItem).where(
                InventoryItem.id == payload.inventory_item_id,
                InventoryItem.business_id == business_id,
                InventoryItem.organization_id == tenant.organization_id,
            )
        )
        item = item_res.scalar_one_or_none()
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Inventory item not found.",
            )
        stock = BranchStock(
            organization_id=tenant.organization_id,
            business_id=business_id,
            branch_id=branch_id,
            inventory_item_id=payload.inventory_item_id,
            quantity=Decimal("0.00"),
            reorder_threshold=item.reorder_threshold,
            ideal_stock_quantity=item.ideal_stock_quantity,
        )
        session.add(stock)
        await session.flush()

    previous_qty = stock.quantity
    new_qty = previous_qty + payload.quantity_change
    if new_qty < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Adjustment cannot result in negative stock quantity ({new_qty}).",
        )

    stock.quantity = new_qty

    # Create immutable audit log
    audit = StockAdjustmentLog(
        organization_id=tenant.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        inventory_item_id=payload.inventory_item_id,
        quantity_change=payload.quantity_change,
        previous_quantity=previous_qty,
        new_quantity=new_qty,
        reason=payload.reason,
        notes=payload.notes,
        adjusted_by_user_id=tenant.user_id,
    )
    session.add(audit)
    await session.commit()
    await session.refresh(stock)

    item = stock.inventory_item
    cost = item.cost_per_unit_usd if item else Decimal("0.00")
    total_val = (stock.quantity * cost).quantize(Decimal("0.01"))

    logger.info(
        "Stock adjusted",
        branch_id=str(branch_id),
        item_id=str(payload.inventory_item_id),
        previous_qty=float(previous_qty),
        new_qty=float(new_qty),
        reason=payload.reason.value,
    )

    return BranchStockResponse(
        id=stock.id,
        branch_id=stock.branch_id,
        branch_name=stock.branch.name_en if stock.branch else None,
        inventory_item_id=stock.inventory_item_id,
        item_name_en=item.name_en if item else "Unknown",
        item_name_km=item.name_km if item else None,
        sku=item.sku if item else None,
        unit_of_measure=item.unit_of_measure,
        quantity=stock.quantity,
        reorder_threshold=stock.reorder_threshold,
        ideal_stock_quantity=stock.ideal_stock_quantity,
        is_low_stock=(stock.quantity <= stock.reorder_threshold),
        is_out_of_stock=(stock.quantity <= 0),
        cost_per_unit_usd=cost,
        total_stock_value_usd=total_val,
        updated_at=stock.updated_at,
    )




async def get_low_stock_alerts(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID | None = None,
) -> LowStockAlertResponse:
    """
    Retrieves low stock alerts across branches or for a specific branch.
    """
    stmt = (
        select(BranchStock)
        .options(
            selectinload(BranchStock.inventory_item), selectinload(BranchStock.branch)
        )
        .where(
            BranchStock.business_id == business_id,
            BranchStock.organization_id == tenant.organization_id,
            BranchStock.quantity <= BranchStock.reorder_threshold,
        )
        .order_by(BranchStock.branch_id.asc(), BranchStock.quantity.asc())
    )

    if branch_id:
        stmt = stmt.where(BranchStock.branch_id == branch_id)
    elif not can_user_roam_branches(tenant.membership):
        stmt = stmt.where(BranchStock.branch_id == tenant.membership.branch_id)

    res = await session.execute(stmt)
    low_stocks = res.scalars().all()

    alerts: list[LowStockAlertItem] = []
    for s in low_stocks:
        item = s.inventory_item
        branch = s.branch
        shortage = max(Decimal("0.00"), s.reorder_threshold - s.quantity)
        alerts.append(
            LowStockAlertItem(
                branch_id=s.branch_id,
                branch_name=branch.name_en if branch else "Unknown",
                branch_code=branch.code if branch else "N/A",
                inventory_item_id=s.inventory_item_id,
                item_name_en=item.name_en if item else "Unknown",
                sku=item.sku if item else None,
                unit_of_measure=item.unit_of_measure,
                current_quantity=s.quantity,
                reorder_threshold=s.reorder_threshold,
                shortage_quantity=shortage,
            )
        )

    return LowStockAlertResponse(
        business_id=business_id,
        total_low_stock_items=len(alerts),
        alerts=alerts,
    )


# Helper Functions
