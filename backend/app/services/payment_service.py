"""
Payment Settlement and Financial Processing Service.

Provides complete business logic for Cambodian dual-currency billing, cash change
calculations with 100-Riel rounding, Bakong KHQR settlement workflows,
audit logging, real-time WebSocket broadcasting, and Telegram manager notifications.
"""

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
from app.core.ws_manager import ws_manager
from app.models.enums import (
    ChangeCurrencyPreference,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    TableSessionStatus,
    TableStatus,
)
from app.models.order import Order
from app.models.payment import Payment
from app.models.promotion import Promotion
from app.models.table_session import TableSession
from app.models.user import User
from app.schemas.payment import (
    CashPaymentRequest,
    KHQRPaymentRequest,
    PaymentResponse,
)
from app.services.audit_service import record_audit_log
from app.services.billing_service import (
    _round_khr_to_hundred,
    calculate_financial_breakdown,
    get_order_bill_summary,
    get_table_session_bill_summary,
)
from app.services.promotion_service import evaluate_discount
from app.services.telegram_service import send_payment_telegram_notification

logger = structlog.get_logger("app.services.payment_service")


# ==============================================================================
# 1. CORE CONSTANTS & PAYMENT IDENTIFIER GENERATORS
# ==============================================================================


def _generate_payment_number() -> str:
    """
    Generates a human-readable unique payment identifier (e.g. PAY-20260821-A1B2).

    Returns:
        Formatted unique payment identifier string.
    """
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_hex = secrets.token_hex(2).upper()
    return f"PAY-{date_str}-{random_hex}"


# ==============================================================================
# 2. DUAL-CURRENCY CASH & 100-RIEL ROUNDING CALCULATORS
# ==============================================================================


def _calculate_cash_change(
    grand_total_usd: Decimal,
    exchange_rate: Decimal,
    amount_tendered_usd: Decimal,
    amount_tendered_khr: int,
    preference: ChangeCurrencyPreference = ChangeCurrencyPreference.KHR,
) -> tuple[Decimal, Decimal, int]:
    """
    Validates tendered cash in dual-currency and computes change returned.

    All Cambodian Riel change amounts are automatically rounded to the nearest 100 Riel.

    Args:
        grand_total_usd: Grand total of the bill in USD.
        exchange_rate: Active exchange rate for USD to KHR conversion.
        amount_tendered_usd: USD cash handed by the customer.
        amount_tendered_khr: KHR cash handed by the customer.
        preference: Change preference mode ('khr', 'usd', or 'split').

    Returns:
        Tuple containing (total_tendered_usd, change_usd, change_khr).

    Raises:
        HTTPException (422): If total tendered cash is insufficient to cover the bill.
    """
    tendered_khr_in_usd = (Decimal(amount_tendered_khr) / exchange_rate).quantize(
        Decimal("0.01")
    )
    total_tendered_usd = amount_tendered_usd + tendered_khr_in_usd

    # Allow tiny floating precision difference (<= $0.005)
    if (total_tendered_usd + Decimal("0.005")) < grand_total_usd:
        grand_total_khr = _round_khr_to_hundred(grand_total_usd * exchange_rate)
        total_tendered_khr = (
            int(amount_tendered_usd * exchange_rate) + amount_tendered_khr
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Insufficient cash tendered. Grand total is ${grand_total_usd:.2f} "
                f"({grand_total_khr:,} KHR), but received "
                f"${total_tendered_usd:.2f} (approx {total_tendered_khr:,} KHR)."
            ),
        )

    excess_usd = max(Decimal("0.00"), total_tendered_usd - grand_total_usd)

    if preference == ChangeCurrencyPreference.USD:
        change_usd = excess_usd
        change_khr = 0
    elif preference == ChangeCurrencyPreference.SPLIT:
        whole_usd = int(excess_usd)
        remainder_usd = excess_usd - Decimal(str(whole_usd))
        change_usd = Decimal(str(whole_usd))
        change_khr = _round_khr_to_hundred(remainder_usd * exchange_rate)
    else:  # KHR mode (Standard in Cambodia)
        change_usd = Decimal("0.00")
        change_khr = _round_khr_to_hundred(excess_usd * exchange_rate)

    return total_tendered_usd, change_usd, change_khr


# ==============================================================================
# 3. DINE-IN TABLE SESSION SETTLEMENT (CASH & KHQR)
# ==============================================================================


async def settle_table_session_cash_payment(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    payload: CashPaymentRequest,
    current_user: User,
    tenant: TenantContext | None = None,
) -> PaymentResponse:
    """
    Settles a dine-in table session with dual-currency cash, closes the session,
    sets the table status to DIRTY, records audit logs, broadcasts WebSocket events,
    and dispatches Telegram manager notifications.

    Args:
        session: Active asynchronous SQLAlchemy database session.
        business_id: UUID of the business entity.
        branch_id: UUID of the operating branch outlet.
        table_session_id: UUID of the active table dining session to settle.
        payload: Cash tender details and optional discount / promo codes.
        current_user: Authenticated cashier user performing the settlement.
        tenant: Optional active tenant context for security validation.

    Returns:
        PaymentResponse: Immutable financial transaction record.
    """
    # 1. Fetch Table Session & Validate
    sess_query = (
        select(TableSession)
        .options(
            selectinload(TableSession.table),
            selectinload(TableSession.branch),
        )
        .where(
            TableSession.id == table_session_id,
            TableSession.business_id == business_id,
            TableSession.branch_id == branch_id,
        )
    )
    if tenant:
        sess_query = sess_query.where(
            TableSession.organization_id == tenant.organization_id
        )

    sess_res = await session.execute(sess_query)
    table_sess = sess_res.scalar_one_or_none()
    if table_sess is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table dining session not found.",
        )

    if table_sess.status != TableSessionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This table session has already been settled.",
        )

    # 2. Calculate Bill Summary
    bill = await get_table_session_bill_summary(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
        tenant=tenant,
    )

    # 3. Evaluate Discount / Promotion
    eval_result = await evaluate_discount(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        subtotal_usd=bill.financials.subtotal_usd,
        promo_code=payload.promo_code,
        manual_discount_type=payload.manual_discount_type,
        manual_discount_value=payload.manual_discount_value,
        discount_reason=payload.discount_reason,
        tenant=tenant,
    )

    if eval_result.discount_usd > Decimal("0.00"):
        financials = calculate_financial_breakdown(
            subtotal_usd=bill.financials.subtotal_usd,
            tax_pct=bill.financials.tax_percent,
            sc_pct=bill.financials.service_charge_percent,
            exchange_rate=bill.financials.exchange_rate,
            discount_usd=eval_result.discount_usd,
        )
        if eval_result.promotion_id:
            promo_res = await session.execute(
                select(Promotion).where(Promotion.id == eval_result.promotion_id)
            )
            promo_obj = promo_res.scalar_one_or_none()
            if promo_obj:
                promo_obj.current_usage_count += 1
    else:
        financials = bill.financials

    # 4. Calculate Cash Change
    total_tendered_usd, change_usd, change_khr = _calculate_cash_change(
        grand_total_usd=financials.grand_total_usd,
        exchange_rate=financials.exchange_rate,
        amount_tendered_usd=payload.amount_tendered_usd,
        amount_tendered_khr=payload.amount_tendered_khr,
        preference=payload.preferred_change_currency,
    )

    # 5. Create Payment Entity
    now_utc = datetime.now(timezone.utc)
    payment = Payment(
        organization_id=table_sess.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
        order_id=None,
        payment_number=_generate_payment_number(),
        payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.COMPLETED,
        bill_subtotal_usd=financials.subtotal_usd,
        discount_usd=financials.discount_usd,
        service_charge_usd=financials.service_charge_amount_usd,
        tax_usd=financials.tax_amount_usd,
        grand_total_usd=financials.grand_total_usd,
        exchange_rate=financials.exchange_rate,
        grand_total_khr=financials.grand_total_khr,
        amount_tendered_usd=payload.amount_tendered_usd,
        amount_tendered_khr=payload.amount_tendered_khr,
        total_tendered_usd=total_tendered_usd,
        change_usd=change_usd,
        change_khr=change_khr,
        promotion_id=eval_result.promotion_id,
        discount_reason=eval_result.discount_reason,
        received_by_user_id=current_user.id,
        notes=payload.notes,
        settled_at=now_utc,
    )
    session.add(payment)

    # 6. Close Table Session
    table_sess.status = TableSessionStatus.COMPLETED
    table_sess.closed_at = now_utc

    # 7. Update Table Status
    table = table_sess.table
    if table:
        table.status = TableStatus.DIRTY_CLEANING

    # 8. Mark All Session Orders as SERVED
    orders_stmt = select(Order).where(Order.table_session_id == table_session_id)
    orders_res = await session.execute(orders_stmt)
    for ord_entity in orders_res.scalars().all():
        if ord_entity.status != OrderStatus.CANCELLED:
            ord_entity.status = OrderStatus.SERVED

    # 9. Record Audit Log
    await record_audit_log(
        session=session,
        organization_id=table_sess.organization_id,
        user_id=current_user.id,
        action="payment.settled",
        resource_type="payment",
        resource_id=str(payment.id),
        details={
            "payment_number": payment.payment_number,
            "method": "cash",
            "table_session_id": str(table_session_id),
            "table_number": table.table_number if table else None,
            "grand_total_usd": str(bill.financials.grand_total_usd),
            "grand_total_khr": bill.financials.grand_total_khr,
            "amount_tendered_usd": str(payload.amount_tendered_usd),
            "amount_tendered_khr": payload.amount_tendered_khr,
            "change_usd": str(change_usd),
            "change_khr": change_khr,
        },
    )

    await session.commit()

    # 10. Real-Time WebSocket Broadcast
    notify_rooms = [f"branch:{branch_id}:pos"]
    if table_session_id:
        notify_rooms.append(f"session:{table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="payment.completed",
        data={
            "payment_id": str(payment.id),
            "payment_number": payment.payment_number,
            "payment_method": payment.payment_method.value,
            "payment_status": payment.payment_status.value,
            "grand_total_usd": str(payment.grand_total_usd),
            "grand_total_khr": int(payment.grand_total_khr),
            "table_session_id": str(payment.table_session_id)
            if payment.table_session_id
            else None,
            "change_usd": str(change_usd),
            "change_khr": int(change_khr),
        },
        business_id=business_id,
        branch_id=branch_id,
    )

    # 11. Send Real-Time Telegram Notification (Non-blocking)
    branch_name = table_sess.branch.name_en if table_sess.branch else "Branch"
    table_ident = (
        f"Table {table.table_number} (Session {table_sess.session_code})"
        if table
        else f"Session {table_sess.session_code}"
    )
    await send_payment_telegram_notification(
        session=session,
        payment=payment,
        branch_name=branch_name,
        table_identifier=table_ident,
        cashier_name=current_user.full_name,
    )

    logger.info(
        "Cash payment settled successfully",
        payment_number=payment.payment_number,
        session_id=str(table_session_id),
        grand_total_usd=float(financials.grand_total_usd),
        change_khr=change_khr,
        cashier_id=str(current_user.id),
    )

    return PaymentResponse(
        id=payment.id,
        organization_id=payment.organization_id,
        business_id=payment.business_id,
        branch_id=payment.branch_id,
        table_session_id=payment.table_session_id,
        order_id=payment.order_id,
        table_number=table.table_number if table else None,
        table_name=f"Table {table.table_number}" if table else None,
        payment_number=payment.payment_number,
        payment_method=payment.payment_method,
        payment_status=payment.payment_status,
        bill_subtotal_usd=payment.bill_subtotal_usd,
        discount_usd=payment.discount_usd,
        service_charge_usd=payment.service_charge_usd,
        tax_usd=payment.tax_usd,
        grand_total_usd=payment.grand_total_usd,
        exchange_rate=payment.exchange_rate,
        grand_total_khr=payment.grand_total_khr,
        amount_tendered_usd=payment.amount_tendered_usd,
        amount_tendered_khr=payment.amount_tendered_khr,
        total_tendered_usd=payment.total_tendered_usd,
        change_usd=payment.change_usd,
        change_khr=payment.change_khr,
        promotion_id=payment.promotion_id,
        discount_reason=payment.discount_reason,
        received_by_user_id=payment.received_by_user_id,
        notes=payment.notes,
        settled_at=payment.settled_at,
        created_at=payment.created_at,
    )


async def settle_table_session_khqr_payment(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    payload: KHQRPaymentRequest,
    current_user: User,
    tenant: TenantContext | None = None,
) -> PaymentResponse:
    """
    Settles a dine-in table session with KHQR (Bakong) payment confirmation,
    closes session, sets table to DIRTY, records audit logs,
    broadcasts WebSocket events, and dispatches Telegram notifications.
    """
    sess_query = (
        select(TableSession)
        .options(
            selectinload(TableSession.table),
            selectinload(TableSession.branch),
        )
        .where(
            TableSession.id == table_session_id,
            TableSession.business_id == business_id,
            TableSession.branch_id == branch_id,
        )
    )
    if tenant:
        sess_query = sess_query.where(
            TableSession.organization_id == tenant.organization_id
        )

    sess_res = await session.execute(sess_query)
    table_sess = sess_res.scalar_one_or_none()
    if table_sess is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table dining session not found.",
        )

    if table_sess.status != TableSessionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This table session has already been settled.",
        )

    bill = await get_table_session_bill_summary(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
        tenant=tenant,
    )

    eval_result = await evaluate_discount(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        subtotal_usd=bill.financials.subtotal_usd,
        promo_code=payload.promo_code,
        manual_discount_type=payload.manual_discount_type,
        manual_discount_value=payload.manual_discount_value,
        discount_reason=payload.discount_reason,
        tenant=tenant,
    )

    if eval_result.discount_usd > Decimal("0.00"):
        financials = calculate_financial_breakdown(
            subtotal_usd=bill.financials.subtotal_usd,
            tax_pct=bill.financials.tax_percent,
            sc_pct=bill.financials.service_charge_percent,
            exchange_rate=bill.financials.exchange_rate,
            discount_usd=eval_result.discount_usd,
        )
        if eval_result.promotion_id:
            promo_res = await session.execute(
                select(Promotion).where(Promotion.id == eval_result.promotion_id)
            )
            promo_obj = promo_res.scalar_one_or_none()
            if promo_obj:
                promo_obj.current_usage_count += 1
    else:
        financials = bill.financials

    now_utc = datetime.now(timezone.utc)
    payment = Payment(
        organization_id=table_sess.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
        order_id=None,
        payment_number=_generate_payment_number(),
        payment_method=PaymentMethod.KHQR,
        payment_status=PaymentStatus.COMPLETED,
        bill_subtotal_usd=financials.subtotal_usd,
        discount_usd=financials.discount_usd,
        service_charge_usd=financials.service_charge_amount_usd,
        tax_usd=financials.tax_amount_usd,
        grand_total_usd=financials.grand_total_usd,
        exchange_rate=financials.exchange_rate,
        grand_total_khr=financials.grand_total_khr,
        amount_tendered_usd=financials.grand_total_usd,
        amount_tendered_khr=0,
        total_tendered_usd=financials.grand_total_usd,
        change_usd=Decimal("0.00"),
        change_khr=0,
        promotion_id=eval_result.promotion_id,
        discount_reason=eval_result.discount_reason,
        received_by_user_id=current_user.id,
        notes=payload.notes or "Settled via KHQR (Bakong)",
        settled_at=now_utc,
    )
    session.add(payment)

    table_sess.status = TableSessionStatus.COMPLETED
    table_sess.closed_at = now_utc

    table = table_sess.table
    if table:
        table.status = TableStatus.DIRTY_CLEANING

    orders_stmt = select(Order).where(Order.table_session_id == table_session_id)
    orders_res = await session.execute(orders_stmt)
    for ord_entity in orders_res.scalars().all():
        if ord_entity.status != OrderStatus.CANCELLED:
            ord_entity.status = OrderStatus.SERVED

    await record_audit_log(
        session=session,
        organization_id=table_sess.organization_id,
        user_id=current_user.id,
        action="payment.settled",
        resource_type="payment",
        resource_id=str(payment.id),
        details={
            "payment_number": payment.payment_number,
            "method": "khqr",
            "table_session_id": str(table_session_id),
            "table_number": table.table_number if table else None,
            "grand_total_usd": str(financials.grand_total_usd),
            "grand_total_khr": financials.grand_total_khr,
        },
    )

    await session.commit()

    notify_rooms = [f"branch:{branch_id}:pos"]
    if table_session_id:
        notify_rooms.append(f"session:{table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="payment.completed",
        data={
            "payment_id": str(payment.id),
            "payment_number": payment.payment_number,
            "payment_method": payment.payment_method.value,
            "payment_status": payment.payment_status.value,
            "grand_total_usd": str(payment.grand_total_usd),
            "grand_total_khr": int(payment.grand_total_khr),
            "table_session_id": str(payment.table_session_id)
            if payment.table_session_id
            else None,
        },
        business_id=business_id,
        branch_id=branch_id,
    )

    branch_name = table_sess.branch.name_en if table_sess.branch else "Branch"
    table_ident = (
        f"Table {table.table_number} (Session {table_sess.session_code})"
        if table
        else f"Session {table_sess.session_code}"
    )
    await send_payment_telegram_notification(
        session=session,
        payment=payment,
        branch_name=branch_name,
        table_identifier=table_ident,
        cashier_name=current_user.full_name,
    )

    logger.info(
        "KHQR payment settled successfully",
        payment_number=payment.payment_number,
        session_id=str(table_session_id),
        grand_total_usd=float(financials.grand_total_usd),
        cashier_id=str(current_user.id),
    )

    return PaymentResponse(
        id=payment.id,
        organization_id=payment.organization_id,
        business_id=payment.business_id,
        branch_id=payment.branch_id,
        table_session_id=payment.table_session_id,
        order_id=payment.order_id,
        table_number=table.table_number if table else None,
        table_name=f"Table {table.table_number}" if table else None,
        payment_number=payment.payment_number,
        payment_method=payment.payment_method,
        payment_status=payment.payment_status,
        bill_subtotal_usd=payment.bill_subtotal_usd,
        discount_usd=payment.discount_usd,
        service_charge_usd=payment.service_charge_usd,
        tax_usd=payment.tax_usd,
        grand_total_usd=payment.grand_total_usd,
        exchange_rate=payment.exchange_rate,
        grand_total_khr=payment.grand_total_khr,
        amount_tendered_usd=payment.amount_tendered_usd,
        amount_tendered_khr=payment.amount_tendered_khr,
        total_tendered_usd=payment.total_tendered_usd,
        change_usd=payment.change_usd,
        change_khr=payment.change_khr,
        promotion_id=payment.promotion_id,
        discount_reason=payment.discount_reason,
        received_by_user_id=payment.received_by_user_id,
        notes=payment.notes,
        settled_at=payment.settled_at,
        created_at=payment.created_at,
    )


# ==============================================================================
# 4. DIRECT / TAKEAWAY ORDER SETTLEMENT (CASH & KHQR)
# ==============================================================================


async def settle_order_cash_payment(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: CashPaymentRequest,
    current_user: User,
    tenant: TenantContext | None = None,
) -> PaymentResponse:
    """
    Settles a single/takeaway order with cash payment, calculates dual-currency change,
    marks order as SERVED, broadcasts WebSocket events, and dispatches Telegram alerts.
    """
    order_query = (
        select(Order)
        .options(
            selectinload(Order.table),
            selectinload(Order.branch),
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

    if order.status == OrderStatus.SERVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This order has already been settled.",
        )

    bill = await get_order_bill_summary(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        tenant=tenant,
    )

    eval_result = await evaluate_discount(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        subtotal_usd=bill.financials.subtotal_usd,
        promo_code=payload.promo_code,
        manual_discount_type=payload.manual_discount_type,
        manual_discount_value=payload.manual_discount_value,
        discount_reason=payload.discount_reason,
        tenant=tenant,
    )

    if eval_result.discount_usd > Decimal("0.00"):
        financials = calculate_financial_breakdown(
            subtotal_usd=bill.financials.subtotal_usd,
            tax_pct=bill.financials.tax_percent,
            sc_pct=bill.financials.service_charge_percent,
            exchange_rate=bill.financials.exchange_rate,
            discount_usd=eval_result.discount_usd,
        )
        if eval_result.promotion_id:
            promo_res = await session.execute(
                select(Promotion).where(Promotion.id == eval_result.promotion_id)
            )
            promo_obj = promo_res.scalar_one_or_none()
            if promo_obj:
                promo_obj.current_usage_count += 1
    else:
        financials = bill.financials

    total_tendered_usd, change_usd, change_khr = _calculate_cash_change(
        grand_total_usd=financials.grand_total_usd,
        exchange_rate=financials.exchange_rate,
        amount_tendered_usd=payload.amount_tendered_usd,
        amount_tendered_khr=payload.amount_tendered_khr,
        preference=payload.preferred_change_currency,
    )

    now_utc = datetime.now(timezone.utc)
    payment = Payment(
        organization_id=order.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=None,
        order_id=order_id,
        payment_number=_generate_payment_number(),
        payment_method=PaymentMethod.CASH,
        payment_status=PaymentStatus.COMPLETED,
        bill_subtotal_usd=financials.subtotal_usd,
        discount_usd=financials.discount_usd,
        service_charge_usd=financials.service_charge_amount_usd,
        tax_usd=financials.tax_amount_usd,
        grand_total_usd=financials.grand_total_usd,
        exchange_rate=financials.exchange_rate,
        grand_total_khr=financials.grand_total_khr,
        amount_tendered_usd=payload.amount_tendered_usd,
        amount_tendered_khr=payload.amount_tendered_khr,
        total_tendered_usd=total_tendered_usd,
        change_usd=change_usd,
        change_khr=change_khr,
        promotion_id=eval_result.promotion_id,
        discount_reason=eval_result.discount_reason,
        received_by_user_id=current_user.id,
        notes=payload.notes,
        settled_at=now_utc,
    )
    session.add(payment)

    order.status = OrderStatus.SERVED

    await record_audit_log(
        session=session,
        organization_id=order.organization_id,
        user_id=current_user.id,
        action="payment.settled",
        resource_type="payment",
        resource_id=str(payment.id),
        details={
            "payment_number": payment.payment_number,
            "method": "cash",
            "order_id": str(order_id),
            "order_number": order.order_number,
            "grand_total_usd": str(bill.financials.grand_total_usd),
            "grand_total_khr": bill.financials.grand_total_khr,
            "amount_tendered_usd": str(payload.amount_tendered_usd),
            "amount_tendered_khr": payload.amount_tendered_khr,
            "change_usd": str(change_usd),
            "change_khr": change_khr,
        },
    )

    await session.commit()

    # Real-time WebSocket Broadcast
    notify_rooms = [f"branch:{branch_id}:pos"]
    if order.table_session_id:
        notify_rooms.append(f"session:{order.table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="payment.completed",
        data={
            "payment_id": str(payment.id),
            "payment_number": payment.payment_number,
            "payment_method": payment.payment_method.value,
            "payment_status": payment.payment_status.value,
            "grand_total_usd": str(payment.grand_total_usd),
            "grand_total_khr": int(payment.grand_total_khr),
            "order_id": str(order.id),
            "change_usd": str(change_usd),
            "change_khr": int(change_khr),
        },
        business_id=business_id,
        branch_id=branch_id,
    )

    branch_name = order.branch.name_en if order.branch else "Branch"
    order_ident = f"Order #{order.order_number}"
    await send_payment_telegram_notification(
        session=session,
        payment=payment,
        branch_name=branch_name,
        table_identifier=order_ident,
        cashier_name=current_user.full_name,
    )

    table = order.table
    return PaymentResponse(
        id=payment.id,
        organization_id=payment.organization_id,
        business_id=payment.business_id,
        branch_id=payment.branch_id,
        table_session_id=payment.table_session_id,
        order_id=payment.order_id,
        table_number=table.table_number if table else None,
        table_name=f"Table {table.table_number}" if table else None,
        payment_number=payment.payment_number,
        payment_method=payment.payment_method,
        payment_status=payment.payment_status,
        bill_subtotal_usd=payment.bill_subtotal_usd,
        discount_usd=payment.discount_usd,
        service_charge_usd=payment.service_charge_usd,
        tax_usd=payment.tax_usd,
        grand_total_usd=payment.grand_total_usd,
        exchange_rate=payment.exchange_rate,
        grand_total_khr=payment.grand_total_khr,
        amount_tendered_usd=payment.amount_tendered_usd,
        amount_tendered_khr=payment.amount_tendered_khr,
        total_tendered_usd=payment.total_tendered_usd,
        change_usd=payment.change_usd,
        change_khr=payment.change_khr,
        promotion_id=payment.promotion_id,
        discount_reason=payment.discount_reason,
        received_by_user_id=payment.received_by_user_id,
        notes=payment.notes,
        settled_at=payment.settled_at,
        created_at=payment.created_at,
    )


async def settle_order_khqr_payment(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: KHQRPaymentRequest,
    current_user: User,
    tenant: TenantContext | None = None,
) -> PaymentResponse:
    """
    Settles a single/takeaway order with KHQR payment confirmation
    and dispatches Telegram notification.
    """
    order_query = (
        select(Order)
        .options(
            selectinload(Order.table),
            selectinload(Order.branch),
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

    if order.status == OrderStatus.SERVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This order has already been settled.",
        )

    bill = await get_order_bill_summary(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        tenant=tenant,
    )

    eval_result = await evaluate_discount(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        subtotal_usd=bill.financials.subtotal_usd,
        promo_code=payload.promo_code,
        manual_discount_type=payload.manual_discount_type,
        manual_discount_value=payload.manual_discount_value,
        discount_reason=payload.discount_reason,
        tenant=tenant,
    )

    if eval_result.discount_usd > Decimal("0.00"):
        financials = calculate_financial_breakdown(
            subtotal_usd=bill.financials.subtotal_usd,
            tax_pct=bill.financials.tax_percent,
            sc_pct=bill.financials.service_charge_percent,
            exchange_rate=bill.financials.exchange_rate,
            discount_usd=eval_result.discount_usd,
        )
        if eval_result.promotion_id:
            promo_res = await session.execute(
                select(Promotion).where(Promotion.id == eval_result.promotion_id)
            )
            promo_obj = promo_res.scalar_one_or_none()
            if promo_obj:
                promo_obj.current_usage_count += 1
    else:
        financials = bill.financials

    now_utc = datetime.now(timezone.utc)
    payment = Payment(
        organization_id=order.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=None,
        order_id=order_id,
        payment_number=_generate_payment_number(),
        payment_method=PaymentMethod.KHQR,
        payment_status=PaymentStatus.COMPLETED,
        bill_subtotal_usd=financials.subtotal_usd,
        discount_usd=financials.discount_usd,
        service_charge_usd=financials.service_charge_amount_usd,
        tax_usd=financials.tax_amount_usd,
        grand_total_usd=financials.grand_total_usd,
        exchange_rate=financials.exchange_rate,
        grand_total_khr=financials.grand_total_khr,
        amount_tendered_usd=financials.grand_total_usd,
        amount_tendered_khr=0,
        total_tendered_usd=financials.grand_total_usd,
        change_usd=Decimal("0.00"),
        change_khr=0,
        promotion_id=eval_result.promotion_id,
        discount_reason=eval_result.discount_reason,
        received_by_user_id=current_user.id,
        notes=payload.notes or "Settled via KHQR (Bakong)",
        settled_at=now_utc,
    )
    session.add(payment)

    order.status = OrderStatus.SERVED

    await record_audit_log(
        session=session,
        organization_id=order.organization_id,
        user_id=current_user.id,
        action="payment.settled",
        resource_type="payment",
        resource_id=str(payment.id),
        details={
            "payment_number": payment.payment_number,
            "method": "khqr",
            "order_id": str(order_id),
            "order_number": order.order_number,
            "grand_total_usd": str(financials.grand_total_usd),
            "grand_total_khr": financials.grand_total_khr,
        },
    )

    await session.commit()

    notify_rooms = [f"branch:{branch_id}:pos"]
    if order.table_session_id:
        notify_rooms.append(f"session:{order.table_session_id}")

    await ws_manager.broadcast_to_rooms(
        rooms=notify_rooms,
        event="payment.completed",
        data={
            "payment_id": str(payment.id),
            "payment_number": payment.payment_number,
            "payment_method": payment.payment_method.value,
            "payment_status": payment.payment_status.value,
            "grand_total_usd": str(payment.grand_total_usd),
            "grand_total_khr": int(payment.grand_total_khr),
            "order_id": str(order.id),
        },
        business_id=business_id,
        branch_id=branch_id,
    )

    branch_name = order.branch.name_en if order.branch else "Branch"
    await send_payment_telegram_notification(
        session=session,
        payment=payment,
        branch_name=branch_name,
        table_identifier=f"Order #{order.order_number}",
        cashier_name=current_user.full_name,
    )

    table = order.table
    return PaymentResponse(
        id=payment.id,
        organization_id=payment.organization_id,
        business_id=payment.business_id,
        branch_id=payment.branch_id,
        table_session_id=payment.table_session_id,
        order_id=payment.order_id,
        table_number=table.table_number if table else None,
        table_name=f"Table {table.table_number}" if table else None,
        payment_number=payment.payment_number,
        payment_method=payment.payment_method,
        payment_status=payment.payment_status,
        bill_subtotal_usd=payment.bill_subtotal_usd,
        discount_usd=payment.discount_usd,
        service_charge_usd=payment.service_charge_usd,
        tax_usd=payment.tax_usd,
        grand_total_usd=payment.grand_total_usd,
        exchange_rate=payment.exchange_rate,
        grand_total_khr=payment.grand_total_khr,
        amount_tendered_usd=payment.amount_tendered_usd,
        amount_tendered_khr=payment.amount_tendered_khr,
        total_tendered_usd=payment.total_tendered_usd,
        change_usd=payment.change_usd,
        change_khr=payment.change_khr,
        promotion_id=payment.promotion_id,
        discount_reason=payment.discount_reason,
        received_by_user_id=payment.received_by_user_id,
        notes=payment.notes,
        settled_at=payment.settled_at,
        created_at=payment.created_at,
    )


# ==============================================================================
# 5. PAYMENT RECORD QUERIES & HISTORY RETRIEVAL
# ==============================================================================


async def get_payment_by_id(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    payment_id: UUID,
    tenant: TenantContext | None = None,
) -> PaymentResponse:
    """
    Retrieves a single payment transaction by ID with associated table details.
    """
    query = (
        select(Payment)
        .options(
            selectinload(Payment.table_session).selectinload(TableSession.table),
            selectinload(Payment.order).selectinload(Order.table),
        )
        .where(
            Payment.id == payment_id,
            Payment.business_id == business_id,
            Payment.branch_id == branch_id,
        )
    )
    if tenant:
        query = query.where(Payment.organization_id == tenant.organization_id)

    res = await session.execute(query)
    payment = res.scalar_one_or_none()
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment record not found.",
        )

    table = None
    if payment.table_session and payment.table_session.table:
        table = payment.table_session.table
    elif payment.order and payment.order.table:
        table = payment.order.table

    return PaymentResponse(
        id=payment.id,
        organization_id=payment.organization_id,
        business_id=payment.business_id,
        branch_id=payment.branch_id,
        table_session_id=payment.table_session_id,
        order_id=payment.order_id,
        table_number=table.table_number if table else None,
        table_name=f"Table {table.table_number}" if table else None,
        payment_number=payment.payment_number,
        payment_method=payment.payment_method,
        payment_status=payment.payment_status,
        bill_subtotal_usd=payment.bill_subtotal_usd,
        discount_usd=payment.discount_usd,
        service_charge_usd=payment.service_charge_usd,
        tax_usd=payment.tax_usd,
        grand_total_usd=payment.grand_total_usd,
        exchange_rate=payment.exchange_rate,
        grand_total_khr=payment.grand_total_khr,
        amount_tendered_usd=payment.amount_tendered_usd,
        amount_tendered_khr=payment.amount_tendered_khr,
        total_tendered_usd=payment.total_tendered_usd,
        change_usd=payment.change_usd,
        change_khr=payment.change_khr,
        promotion_id=payment.promotion_id,
        discount_reason=payment.discount_reason,
        received_by_user_id=payment.received_by_user_id,
        notes=payment.notes,
        settled_at=payment.settled_at,
        created_at=payment.created_at,
    )


# Backward-compatible aliases for endpoints & test callers
settle_single_order_cash_payment = settle_order_cash_payment
settle_single_order_khqr_payment = settle_order_khqr_payment
