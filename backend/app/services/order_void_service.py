from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.tenant import TenantContext
from app.models.enums import (
    MembershipStatus,
    OrderItemStatus,
    OrderStatus,
    StaffRole,
    TableSessionStatus,
    VoidReasonCode,
)
from app.models.order import Order, OrderItem
from app.models.organization_membership import OrganizationMembership
from app.models.table_session import TableSession
from app.models.user import User
from app.schemas.order_void import (
    CancelOrderRequest,
    CancelOrderResponse,
    VoidOrderItemRequest,
    VoidOrderItemResponse,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.order_void_service")

ALLOWED_VOID_ROLES = {StaffRole.OWNER, StaffRole.MANAGER, StaffRole.CASHIER}


async def _verify_void_authorization(
    session: AsyncSession,
    user_id: UUID,
    organization_id: UUID,
) -> OrganizationMembership:
    """Verifies that the staff user has authority (Owner, Manager, or Cashier) to void/cancel."""
    membership_res = await session.execute(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
        )
    )
    membership = membership_res.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not an active member of this organization.",
        )

    if not membership.is_owner and membership.role not in ALLOWED_VOID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: Only owners, managers, or cashiers can authorize item voids or order cancellations.",
        )

    return membership


async def void_order_line_item(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    item_id: UUID,
    payload: VoidOrderItemRequest,
    current_user: User,
    tenant: TenantContext | None = None,
) -> VoidOrderItemResponse:
    """
    Voids an individual line item in an order with mandatory reason tracking and audit logging.
    Recalculates parent order totals and cancels the order if all items are voided.
    """
    # 1. Fetch Order and verify tenant
    order_query = (
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.table_session),
        )
        .where(
            Order.id == order_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
    )
    if tenant:
        order_query = order_query.where(Order.organization_id == tenant.organization_id)

    order_res = await session.execute(order_query)
    order = order_res.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )

    # 2. Authorization check
    await _verify_void_authorization(
        session=session,
        user_id=current_user.id,
        organization_id=order.organization_id,
    )

    # 3. Guard against settled table session
    if order.table_session and order.table_session.status == TableSessionStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot void items on an already settled and completed dining session.",
        )

    # 4. Find the item
    target_item: OrderItem | None = None
    for itm in order.items:
        if itm.id == item_id:
            target_item = itm
            break

    if target_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order line item not found in this order.",
        )

    if target_item.status == OrderItemStatus.VOIDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This item has already been voided.",
        )

    # 5. Apply Void Status & Metadata
    now_utc = datetime.now(timezone.utc)
    target_item.status = OrderItemStatus.VOIDED
    target_item.void_reason_code = payload.void_reason_code.value
    target_item.void_reason = payload.void_reason
    target_item.voided_by_user_id = current_user.id
    target_item.voided_at = now_utc

    # 6. Recalculate Order Totals
    active_items = [itm for itm in order.items if itm.status != OrderItemStatus.VOIDED]
    new_subtotal_usd = sum(itm.subtotal_price for itm in active_items) if active_items else Decimal("0.00")
    order.subtotal_usd = new_subtotal_usd
    order.subtotal_khr = (new_subtotal_usd * Decimal("4100.00")).quantize(Decimal("0.01"))

    # Recalculate tax & service charge proportionally
    order.service_charge_amount_usd = (new_subtotal_usd * (order.service_charge_percent / Decimal("100"))).quantize(Decimal("0.01"))
    taxable = new_subtotal_usd + order.service_charge_amount_usd
    order.tax_amount_usd = (taxable * (order.tax_rate_percent / Decimal("100"))).quantize(Decimal("0.01"))
    order.total_amount_usd = new_subtotal_usd + order.service_charge_amount_usd + order.tax_amount_usd
    order.total_amount_khr = (order.total_amount_usd * Decimal("4100.00")).quantize(Decimal("0.01"))

    # If all items are voided, mark the entire order CANCELLED
    if not active_items:
        order.status = OrderStatus.CANCELLED
        order.cancel_reason_code = payload.void_reason_code.value
        order.cancel_reason = payload.void_reason
        order.cancelled_by_user_id = current_user.id
        order.cancelled_at = now_utc

    # 7. Record Immutable Audit Log
    await record_audit_log(
        session=session,
        organization_id=order.organization_id,
        user_id=current_user.id,
        action="order_item.voided",
        resource_type="order_item",
        resource_id=str(target_item.id),
        details={
            "order_id": str(order.id),
            "order_number": order.order_number,
            "item_name_en": target_item.item_name_en,
            "quantity": target_item.quantity,
            "unit_price_usd": str(target_item.unit_price),
            "subtotal_price_usd": str(target_item.subtotal_price),
            "void_reason_code": payload.void_reason_code.value,
            "void_reason": payload.void_reason,
            "voided_by_name": current_user.full_name,
            "order_cancelled_due_to_all_voided": not bool(active_items),
        },
    )

    await session.commit()

    logger.info(
        "Order item voided successfully",
        item_id=str(target_item.id),
        order_number=order.order_number,
        void_reason=payload.void_reason_code.value,
        voided_by=str(current_user.id),
    )

    return VoidOrderItemResponse(
        id=target_item.id,
        order_id=order.id,
        item_name_en=target_item.item_name_en,
        item_name_km=target_item.item_name_km,
        quantity=target_item.quantity,
        status=target_item.status,
        void_reason_code=target_item.void_reason_code,
        void_reason=target_item.void_reason,
        voided_by_user_id=target_item.voided_by_user_id,
        voided_at=target_item.voided_at,
    )


async def cancel_entire_order_round(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: CancelOrderRequest,
    current_user: User,
    tenant: TenantContext | None = None,
) -> CancelOrderResponse:
    """
    Cancels an entire order round, voids all active child items, and records an audit log.
    """
    order_query = (
        select(Order)
        .options(
            selectinload(Order.items),
            selectinload(Order.table_session),
        )
        .where(
            Order.id == order_id,
            Order.business_id == business_id,
            Order.branch_id == branch_id,
        )
    )
    if tenant:
        order_query = order_query.where(Order.organization_id == tenant.organization_id)

    order_res = await session.execute(order_query)
    order = order_res.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )

    # Authorization check
    await _verify_void_authorization(
        session=session,
        user_id=current_user.id,
        organization_id=order.organization_id,
    )

    if order.table_session and order.table_session.status == TableSessionStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot cancel order on an already settled and completed dining session.",
        )

    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order is already cancelled.",
        )

    now_utc = datetime.now(timezone.utc)
    order.status = OrderStatus.CANCELLED
    order.cancel_reason_code = payload.cancel_reason_code.value
    order.cancel_reason = payload.cancel_reason
    order.cancelled_by_user_id = current_user.id
    order.cancelled_at = now_utc

    # Void all items
    void_count = 0
    for itm in order.items:
        if itm.status != OrderItemStatus.VOIDED:
            itm.status = OrderItemStatus.VOIDED
            itm.void_reason_code = payload.cancel_reason_code.value
            itm.void_reason = payload.cancel_reason or "Order round cancelled"
            itm.voided_by_user_id = current_user.id
            itm.voided_at = now_utc
            void_count += 1

    # Zero out totals
    order.subtotal_usd = Decimal("0.00")
    order.subtotal_khr = Decimal("0.00")
    order.service_charge_amount_usd = Decimal("0.00")
    order.tax_amount_usd = Decimal("0.00")
    order.total_amount_usd = Decimal("0.00")
    order.total_amount_khr = Decimal("0.00")

    await record_audit_log(
        session=session,
        organization_id=order.organization_id,
        user_id=current_user.id,
        action="order.cancelled",
        resource_type="order",
        resource_id=str(order.id),
        details={
            "order_number": order.order_number,
            "round_number": order.round_number,
            "items_voided_count": void_count,
            "cancel_reason_code": payload.cancel_reason_code.value,
            "cancel_reason": payload.cancel_reason,
            "cancelled_by_name": current_user.full_name,
        },
    )

    await session.commit()

    logger.info(
        "Order round cancelled successfully",
        order_number=order.order_number,
        void_count=void_count,
        cancel_reason=payload.cancel_reason_code.value,
        cancelled_by=str(current_user.id),
    )

    return CancelOrderResponse(
        order_id=order.id,
        order_number=order.order_number,
        status=order.status,
        cancel_reason_code=order.cancel_reason_code,
        cancel_reason=order.cancel_reason,
        cancelled_by_user_id=order.cancelled_by_user_id,
        cancelled_at=order.cancelled_at,
        voided_item_count=void_count,
    )
