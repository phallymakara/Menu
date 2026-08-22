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

from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.enums import (
    StockAdjustmentReason,
    StockTransferStatus,
)
from app.models.inventory import (
    BranchStock,
    InventoryItem,
    StockAdjustmentLog,
    StockTransfer,
    StockTransferItem,
)
from app.schemas.inventory import (
    BranchStockAdjustRequest,
    BranchStockResponse,
    InventoryItemCreate,
    InventoryItemResponse,
    LowStockAlertItem,
    LowStockAlertResponse,
    StockTransferCreateRequest,
    StockTransferItemResponse,
    StockTransferResponse,
)
from app.services.branch_roaming_service import can_user_roam_branches

logger = structlog.get_logger("app.services.inventory_service")


def _generate_transfer_number() -> str:
    """Generates unique transfer number e.g. TRF-20260822-ABCD."""
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    hex_code = secrets.token_hex(2).upper()
    return f"TRF-{date_str}-{hex_code}"


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
    """
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
    """
    _enforce_inventory_branch_access(tenant, branch_id)

    # Fetch or initialize BranchStock
    stmt = (
        select(BranchStock)
        .options(
            selectinload(BranchStock.inventory_item), selectinload(BranchStock.branch)
        )
        .where(
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


async def create_stock_transfer(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    payload: StockTransferCreateRequest,
) -> StockTransferResponse:
    """
    Creates an inter-branch stock transfer request.
    """
    if payload.source_branch_id == payload.destination_branch_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and destination branches cannot be the same.",
        )

    # Validate destination branch access (must be assigned or have roaming access)
    if (
        not can_user_roam_branches(tenant.membership)
        and tenant.membership.branch_id != payload.destination_branch_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Access denied. You can only request transfers "
                "for your assigned branch."
            ),
        )

    # Verify branches
    branches_res = await session.execute(
        select(Branch).where(
            Branch.id.in_([payload.source_branch_id, payload.destination_branch_id]),
            Branch.business_id == business_id,
        )
    )
    branches_map = {b.id: b for b in branches_res.scalars().all()}
    if (
        payload.source_branch_id not in branches_map
        or payload.destination_branch_id not in branches_map
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or both branches not found.",
        )

    transfer = StockTransfer(
        organization_id=tenant.organization_id,
        business_id=business_id,
        transfer_number=_generate_transfer_number(),
        source_branch_id=payload.source_branch_id,
        destination_branch_id=payload.destination_branch_id,
        status=StockTransferStatus.REQUESTED,
        requested_by_user_id=tenant.user_id,
        notes=payload.notes,
    )
    session.add(transfer)
    await session.flush()

    # Add transfer items
    for item_req in payload.items:
        trf_item = StockTransferItem(
            transfer_id=transfer.id,
            inventory_item_id=item_req.inventory_item_id,
            requested_quantity=item_req.requested_quantity,
            shipped_quantity=Decimal("0.00"),
            received_quantity=Decimal("0.00"),
        )
        session.add(trf_item)

    await session.commit()

    # Re-fetch with relationships loaded
    return await _fetch_transfer_response(session, transfer.id)


async def approve_stock_transfer(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    transfer_id: UUID,
) -> StockTransferResponse:
    """
    Approves a stock transfer request.
    Only source branch staff, GM, or Owner can approve.
    """
    transfer = await _get_transfer_or_404(session, business_id, transfer_id)

    # Check approval permission (Source branch manager or Roaming GM/Owner)
    if (
        not can_user_roam_branches(tenant.membership)
        and tenant.membership.branch_id != transfer.source_branch_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Access denied. Only source branch staff or General Managers "
                "can approve this transfer."
            ),
        )

    if transfer.status != StockTransferStatus.REQUESTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve transfer with status '{transfer.status.value}'.",
        )

    transfer.status = StockTransferStatus.APPROVED
    transfer.approved_by_user_id = tenant.user_id

    await session.commit()
    logger.info("Stock transfer approved", transfer_number=transfer.transfer_number)
    return await _fetch_transfer_response(session, transfer.id)


async def dispatch_stock_transfer(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    transfer_id: UUID,
) -> StockTransferResponse:
    """
    Dispatches transfer (IN_TRANSIT) and immediately deducts stock from Source Branch.
    """
    transfer = await _get_transfer_or_404(session, business_id, transfer_id)

    if (
        not can_user_roam_branches(tenant.membership)
        and tenant.membership.branch_id != transfer.source_branch_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Access denied. Only source branch staff can dispatch this shipment."
            ),
        )

    if transfer.status not in (
        StockTransferStatus.REQUESTED,
        StockTransferStatus.APPROVED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot dispatch transfer with status '{transfer.status.value}'.",
        )

    now_utc = datetime.now(timezone.utc)
    transfer.status = StockTransferStatus.IN_TRANSIT
    transfer.dispatched_at = now_utc

    # Deduct stock from source branch
    for t_item in transfer.items:
        t_item.shipped_quantity = t_item.requested_quantity
        stock_stmt = select(BranchStock).where(
            BranchStock.branch_id == transfer.source_branch_id,
            BranchStock.inventory_item_id == t_item.inventory_item_id,
        )
        stock_res = await session.execute(stock_stmt)
        source_stock = stock_res.scalar_one_or_none()

        if source_stock:
            prev = source_stock.quantity
            source_stock.quantity = max(Decimal("0.00"), prev - t_item.shipped_quantity)
            audit = StockAdjustmentLog(
                organization_id=tenant.organization_id,
                business_id=business_id,
                branch_id=transfer.source_branch_id,
                inventory_item_id=t_item.inventory_item_id,
                quantity_change=-t_item.shipped_quantity,
                previous_quantity=prev,
                new_quantity=source_stock.quantity,
                reason=StockAdjustmentReason.TRANSFER_OUT,
                notes=f"Dispatched via transfer {transfer.transfer_number}",
                adjusted_by_user_id=tenant.user_id,
            )
            session.add(audit)

    await session.commit()
    logger.info("Stock transfer dispatched", transfer_number=transfer.transfer_number)
    return await _fetch_transfer_response(session, transfer.id)


async def receive_stock_transfer(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    transfer_id: UUID,
) -> StockTransferResponse:
    """
    Receives shipment (COMPLETED) and increments stock at Destination Branch.
    """
    transfer = await _get_transfer_or_404(session, business_id, transfer_id)

    if (
        not can_user_roam_branches(tenant.membership)
        and tenant.membership.branch_id != transfer.destination_branch_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Access denied. Only destination branch staff "
                "can receive this shipment."
            ),
        )

    if transfer.status != StockTransferStatus.IN_TRANSIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot receive transfer with status '{transfer.status.value}'. "
                "Must be IN_TRANSIT."
            ),
        )

    now_utc = datetime.now(timezone.utc)
    transfer.status = StockTransferStatus.COMPLETED
    transfer.received_at = now_utc

    # Increment stock at destination branch
    for t_item in transfer.items:
        t_item.received_quantity = t_item.shipped_quantity
        stock_stmt = select(BranchStock).where(
            BranchStock.branch_id == transfer.destination_branch_id,
            BranchStock.inventory_item_id == t_item.inventory_item_id,
        )
        stock_res = await session.execute(stock_stmt)
        dest_stock = stock_res.scalar_one_or_none()

        if dest_stock is None:
            dest_stock = BranchStock(
                organization_id=tenant.organization_id,
                business_id=business_id,
                branch_id=transfer.destination_branch_id,
                inventory_item_id=t_item.inventory_item_id,
                quantity=Decimal("0.00"),
                reorder_threshold=Decimal("0.00"),
                ideal_stock_quantity=Decimal("0.00"),
            )
            session.add(dest_stock)
            await session.flush()

        prev = dest_stock.quantity
        dest_stock.quantity = prev + t_item.received_quantity

        audit = StockAdjustmentLog(
            organization_id=tenant.organization_id,
            business_id=business_id,
            branch_id=transfer.destination_branch_id,
            inventory_item_id=t_item.inventory_item_id,
            quantity_change=t_item.received_quantity,
            previous_quantity=prev,
            new_quantity=dest_stock.quantity,
            reason=StockAdjustmentReason.TRANSFER_IN,
            notes=f"Received from transfer {transfer.transfer_number}",
            adjusted_by_user_id=tenant.user_id,
        )
        session.add(audit)

    await session.commit()
    logger.info(
        "Stock transfer received and completed",
        transfer_number=transfer.transfer_number,
    )
    return await _fetch_transfer_response(session, transfer.id)


async def get_stock_transfers(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID | None = None,
) -> list[StockTransferResponse]:
    """
    Lists stock transfers, optionally filtered by branch (either source or destination).
    """
    stmt = (
        select(StockTransfer)
        .options(
            selectinload(StockTransfer.source_branch),
            selectinload(StockTransfer.destination_branch),
            selectinload(StockTransfer.requested_by_user),
            selectinload(StockTransfer.approved_by_user),
            selectinload(StockTransfer.items).selectinload(
                StockTransferItem.inventory_item
            ),
        )
        .where(
            StockTransfer.business_id == business_id,
            StockTransfer.organization_id == tenant.organization_id,
        )
        .order_by(StockTransfer.created_at.desc())
    )

    if branch_id:
        stmt = stmt.where(
            (StockTransfer.source_branch_id == branch_id)
            | (StockTransfer.destination_branch_id == branch_id)
        )
    elif not can_user_roam_branches(tenant.membership):
        user_branch = tenant.membership.branch_id
        stmt = stmt.where(
            (StockTransfer.source_branch_id == user_branch)
            | (StockTransfer.destination_branch_id == user_branch)
        )

    res = await session.execute(stmt)
    transfers = res.scalars().all()

    return [_build_transfer_response_from_entity(t) for t in transfers]


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
async def _get_transfer_or_404(
    session: AsyncSession, business_id: UUID, transfer_id: UUID
) -> StockTransfer:
    stmt = (
        select(StockTransfer)
        .options(
            selectinload(StockTransfer.source_branch),
            selectinload(StockTransfer.destination_branch),
            selectinload(StockTransfer.requested_by_user),
            selectinload(StockTransfer.approved_by_user),
            selectinload(StockTransfer.items).selectinload(
                StockTransferItem.inventory_item
            ),
        )
        .where(
            StockTransfer.id == transfer_id,
            StockTransfer.business_id == business_id,
        )
    )
    res = await session.execute(stmt)
    transfer = res.scalar_one_or_none()
    if transfer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Stock transfer not found."
        )
    return transfer


async def _fetch_transfer_response(
    session: AsyncSession, transfer_id: UUID
) -> StockTransferResponse:
    stmt = (
        select(StockTransfer)
        .options(
            selectinload(StockTransfer.source_branch),
            selectinload(StockTransfer.destination_branch),
            selectinload(StockTransfer.requested_by_user),
            selectinload(StockTransfer.approved_by_user),
            selectinload(StockTransfer.items).selectinload(
                StockTransferItem.inventory_item
            ),
        )
        .where(StockTransfer.id == transfer_id)
    )
    res = await session.execute(stmt)
    transfer = res.scalar_one()
    return _build_transfer_response_from_entity(transfer)


def _build_transfer_response_from_entity(t: StockTransfer) -> StockTransferResponse:
    item_responses = [
        StockTransferItemResponse(
            id=i.id,
            inventory_item_id=i.inventory_item_id,
            item_name_en=i.inventory_item.name_en if i.inventory_item else "Unknown",
            unit_of_measure=i.inventory_item.unit_of_measure
            if i.inventory_item
            else "piece",
            requested_quantity=i.requested_quantity,
            shipped_quantity=i.shipped_quantity,
            received_quantity=i.received_quantity,
        )
        for i in t.items
    ]

    return StockTransferResponse(
        id=t.id,
        transfer_number=t.transfer_number,
        source_branch_id=t.source_branch_id,
        source_branch_name=t.source_branch.name_en if t.source_branch else "Unknown",
        destination_branch_id=t.destination_branch_id,
        destination_branch_name=t.destination_branch.name_en
        if t.destination_branch
        else "Unknown",
        status=t.status,
        requested_by_user_id=t.requested_by_user_id,
        requested_by_name=t.requested_by_user.full_name
        if t.requested_by_user
        else "Unknown",
        approved_by_user_id=t.approved_by_user_id,
        approved_by_name=t.approved_by_user.full_name if t.approved_by_user else None,
        dispatched_at=t.dispatched_at,
        received_at=t.received_at,
        notes=t.notes,
        items=item_responses,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )
