"""
Payment Settlement and Financial Processing Service.

Provides complete business logic for Cambodian dual-currency billing, cash change
calculations with 100-Riel rounding, Bakong KHQR settlement workflows,
audit logging, real-time WebSocket broadcasting, and Telegram manager notifications.

A KHQR bill is only settled from a payment attempt that Bakong confirmed as paid,
or through a manual confirmation by an owner or manager that is audited.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    PermissionDeniedError,
    ResourceConflictError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.core.ws_manager import ws_manager
from app.integrations.bakong import BakongClient
from app.models.enums import (
    ChangeCurrencyPreference,
    KHQRPaymentAttemptStatus,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    StaffRole,
    TableSessionStatus,
    TableStatus,
)
from app.models.khqr_payment_attempt import KHQRPaymentAttempt
from app.models.order import Order
from app.models.payment import Payment
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.models.user import User
from app.schemas.billing import BillFinancialBreakdown, BillSummaryResponse
from app.schemas.payment import (
    CashPaymentRequest,
    KHQRBillAdjustments,
    KHQRManualConfirmationRequest,
    KHQRPaymentRequest,
    PaymentResponse,
)
from app.services.audit_service import record_audit_log
from app.services.billing_service import (
    _resolve_financial_settings,
    _round_khr_to_hundred,
    calculate_financial_breakdown,
    evaluate_manual_discount,
    get_order_bill_summary,
    get_table_session_bill_summary,
)
from app.services.khqr_service import (
    KHQRBillQuote,
    check_attempt_with_bakong,
    confirm_attempt_under_lock,
    ensure_attempt_open,
    ensure_attempt_targets,
    ensure_quote_matches_attempt,
    get_khqr_attempt,
    lock_khqr_attempt,
    quote_order_bill,
    quote_table_session_bill,
)
from app.services.telegram_service import send_payment_telegram_notification

logger = structlog.get_logger("app.services.payment_service")


# ==============================================================================
# 1. CORE CONSTANTS & PAYMENT IDENTIFIER GENERATORS
# ==============================================================================


# A session can be settled while it is open or after the guest has asked for the bill.
_SETTLEABLE_SESSION_STATUSES = (
    TableSessionStatus.ACTIVE,
    TableSessionStatus.BILL_REQUESTED,
)


async def _discounted_financials(
    session: AsyncSession,
    branch_id: UUID,
    bill: BillSummaryResponse,
    discount_usd: Decimal,
) -> BillFinancialBreakdown:
    """
    Recomputes a bill's breakdown after a discount.

    Uses the bill's own tax and service-charge settings, including the inclusive
    flags, so applying a discount can only lower the amount due.
    """
    _, _, _, is_tax_inclusive, is_sc_inclusive = await _resolve_financial_settings(
        session=session,
        branch_id=branch_id,
        table_id=bill.table_id,
    )
    return calculate_financial_breakdown(
        subtotal_usd=bill.financials.subtotal_usd,
        tax_pct=bill.financials.tax_percent,
        sc_pct=bill.financials.service_charge_percent,
        exchange_rate=bill.financials.exchange_rate,
        discount_usd=discount_usd,
        is_tax_inclusive=is_tax_inclusive,
        is_sc_inclusive=is_sc_inclusive,
    )


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
    tenant: TenantContext,
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

    if table_sess.status not in _SETTLEABLE_SESSION_STATUSES:
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

    # 3. Evaluate Discount
    discount_usd, _, discount_reason_str = evaluate_manual_discount(
        subtotal_usd=bill.financials.subtotal_usd,
        manual_discount_type=payload.manual_discount_type,
        manual_discount_value=payload.manual_discount_value,
        discount_reason=payload.discount_reason,
    )

    if discount_usd > Decimal("0.00"):
        financials = await _discounted_financials(
            session=session,
            branch_id=branch_id,
            bill=bill,
            discount_usd=discount_usd,
        )
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
        discount_reason=discount_reason_str,
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
        discount_reason=payment.discount_reason,
        received_by_user_id=payment.received_by_user_id,
        notes=payment.notes,
        settled_at=payment.settled_at,
        created_at=payment.created_at,
    )


# ------------------------------------------------------------------------------
# KHQR settlement helpers (shared by dine-in sessions and single orders)
# ------------------------------------------------------------------------------

_KHQR_VERIFIED_NOTE = "Settled via KHQR (verified by Bakong)"
_KHQR_MANUAL_NOTE = "KHQR payment confirmed manually"


async def _load_khqr_table_session(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    tenant: TenantContext,
    *,
    lock: bool = False,
) -> TableSession:
    """
    Load a table session of the tenant with its table and branch.

    With ``lock`` the row is re-read under SELECT ... FOR UPDATE (a no-op on
    SQLite), replacing the copy already loaded in the session.

    Raises:
        TenantNotFoundError: If the session does not exist for this tenant.
    """
    query = (
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
    query = query.where(TableSession.organization_id == tenant.organization_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    table_sess = (await session.execute(query)).scalar_one_or_none()
    if table_sess is None:
        raise TenantNotFoundError("Table dining session not found.")
    return table_sess


def _ensure_session_settleable(table_sess: TableSession) -> None:
    """Raise ResourceConflictError when the session can no longer be paid."""
    if table_sess.status not in _SETTLEABLE_SESSION_STATUSES:
        raise ResourceConflictError("This table session has already been settled.")


async def _load_khqr_order(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    tenant: TenantContext,
    *,
    lock: bool = False,
) -> Order:
    """
    Load an order of the tenant with its table and branch.

    With ``lock`` the row is re-read under SELECT ... FOR UPDATE (a no-op on
    SQLite), replacing the copy already loaded in the session.

    Raises:
        TenantNotFoundError: If the order does not exist for this tenant.
    """
    query = (
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
    query = query.where(Order.organization_id == tenant.organization_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    order = (await session.execute(query)).scalar_one_or_none()
    if order is None:
        raise TenantNotFoundError("Order not found.")
    return order


def _ensure_order_settleable(order: Order) -> None:
    """Raise ResourceConflictError when the order can no longer be paid."""
    if order.status == OrderStatus.SERVED:
        raise ResourceConflictError("This order has already been settled.")
    if order.status == OrderStatus.CANCELLED:
        raise ResourceConflictError("This order has been cancelled.")


async def _quote_session_for_khqr(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    adjustments: KHQRBillAdjustments,
    tenant: TenantContext,
) -> KHQRBillQuote:
    """Price a session bill with the discount sent for a KHQR settlement."""
    return await quote_table_session_bill(
        session,
        business_id,
        branch_id,
        table_session_id,
        manual_discount_type=adjustments.manual_discount_type,
        manual_discount_value=adjustments.manual_discount_value,
        discount_reason=adjustments.discount_reason,
        tenant=tenant,
    )


async def _quote_order_for_khqr(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    adjustments: KHQRBillAdjustments,
    tenant: TenantContext,
) -> KHQRBillQuote:
    """Price an order bill with the discount sent for a KHQR settlement."""
    return await quote_order_bill(
        session,
        business_id,
        branch_id,
        order_id,
        manual_discount_type=adjustments.manual_discount_type,
        manual_discount_value=adjustments.manual_discount_value,
        discount_reason=adjustments.discount_reason,
        tenant=tenant,
    )


def _ensure_can_confirm_khqr_manually(tenant: TenantContext, branch_id: UUID) -> str:
    """
    Allow manual KHQR confirmation for owners and managers only.

    A manager assigned to one branch may only confirm payments of that branch.

    Returns:
        The role recorded in the audit log ("owner" or "manager").

    Raises:
        PermissionDeniedError: For any other role, or a branch mismatch.
    """
    membership = tenant.membership
    is_owner = membership.is_owner or membership.role == StaffRole.OWNER
    if not is_owner and membership.role != StaffRole.MANAGER:
        logger.warning(
            "Manual KHQR confirmation denied: owner or manager role required",
            user_id=str(tenant.user_id),
            organization_id=str(tenant.organization_id),
            role=str(membership.role),
        )
        raise PermissionDeniedError(
            "Only owners and managers can confirm a KHQR payment manually."
        )
    if (
        not is_owner
        and membership.branch_id is not None
        and membership.branch_id != branch_id
    ):
        logger.warning(
            "Manual KHQR confirmation denied: manager of another branch",
            user_id=str(tenant.user_id),
            organization_id=str(tenant.organization_id),
            branch_id=str(branch_id),
        )
        raise PermissionDeniedError(
            "Branch managers can only confirm KHQR payments of their own branch."
        )
    return "owner" if is_owner else StaffRole.MANAGER.value


async def _lock_attempt_for_manual_confirmation(
    session: AsyncSession,
    attempt_id: UUID | None,
    *,
    business_id: UUID,
    branch_id: UUID,
    organization_id: UUID,
    table_session_id: UUID | None = None,
    order_id: UUID | None = None,
) -> KHQRPaymentAttempt | None:
    """
    Lock the attempt a manual confirmation refers to, if any.

    The attempt may be in any status (for example expired, or still pending
    because Bakong is not configured) but must belong to this bill and must not
    have settled a bill already.
    """
    if attempt_id is None:
        return None
    attempt = await get_khqr_attempt(
        session,
        attempt_id=attempt_id,
        business_id=business_id,
        branch_id=branch_id,
        organization_id=organization_id,
    )
    ensure_attempt_targets(
        attempt, table_session_id=table_session_id, order_id=order_id
    )
    attempt = await lock_khqr_attempt(session, attempt.id)
    if attempt.payment_id is not None:
        raise ResourceConflictError(
            "This KHQR payment attempt has already been settled."
        )
    return attempt


def _new_khqr_payment(
    *,
    organization_id: UUID,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID | None,
    order_id: UUID | None,
    quote: KHQRBillQuote,
    current_user: User,
    notes: str | None,
    attempt: KHQRPaymentAttempt | None,
    manual_reason: str | None,
    settled_at: datetime,
) -> Payment:
    """Build the Payment of a KHQR settlement with its verification evidence."""
    financials = quote.financials
    is_manual = manual_reason is not None
    bakong_reference = (
        attempt.bakong_reference
        if attempt is not None and attempt.status == KHQRPaymentAttemptStatus.SUCCEEDED
        else None
    )
    return Payment(
        id=uuid4(),
        organization_id=organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
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
        discount_reason=quote.discount_reason,
        received_by_user_id=current_user.id,
        notes=notes or (_KHQR_MANUAL_NOTE if is_manual else _KHQR_VERIFIED_NOTE),
        bakong_reference=bakong_reference,
        is_manually_confirmed=is_manual,
        manual_confirmation_reason=manual_reason,
        settled_at=settled_at,
    )


async def _record_khqr_payment(
    session: AsyncSession,
    payment: Payment,
    attempt: KHQRPaymentAttempt | None,
    quote: KHQRBillQuote,
) -> None:
    """Persist the Payment and link the attempt to it."""
    session.add(payment)
    await session.flush()
    if attempt is not None:
        attempt.status = KHQRPaymentAttemptStatus.SUCCEEDED
        attempt.payment_id = payment.id


def _khqr_audit_details(
    payment: Payment,
    attempt: KHQRPaymentAttempt | None,
    attempt_status_before: str | None,
    manual_reason: str | None,
    confirmed_by_role: str | None,
) -> dict[str, Any]:
    """Audit details shared by verified and manually confirmed KHQR payments."""
    details: dict[str, Any] = {
        "payment_number": payment.payment_number,
        "method": "khqr",
        "verification": "manual_override" if manual_reason is not None else "bakong",
        "grand_total_usd": str(payment.grand_total_usd),
        "grand_total_khr": payment.grand_total_khr,
        "bakong_reference": payment.bakong_reference,
        "khqr_attempt_id": str(attempt.id) if attempt is not None else None,
        "khqr_amount": str(attempt.amount) if attempt is not None else None,
        "khqr_currency": attempt.currency if attempt is not None else None,
    }
    if manual_reason is not None:
        details.update(
            {
                "manual_override": True,
                "reason": manual_reason,
                "confirmed_by_role": confirmed_by_role,
                "attempt_status_before_override": attempt_status_before,
            }
        )
    return details


def _khqr_audit_action(manual_reason: str | None) -> str:
    """Audit action of a KHQR settlement: a regular settlement or a manual override."""
    return (
        "payment.khqr_manual_override"
        if manual_reason is not None
        else "payment.settled"
    )


def _khqr_payment_response(
    payment: Payment, table: RestaurantTable | None
) -> PaymentResponse:
    """Serialize a KHQR Payment, including its verification evidence."""
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
        discount_reason=payment.discount_reason,
        received_by_user_id=payment.received_by_user_id,
        notes=payment.notes,
        bakong_reference=payment.bakong_reference,
        is_manually_confirmed=payment.is_manually_confirmed,
        manual_confirmation_reason=payment.manual_confirmation_reason,
        settled_at=payment.settled_at,
        created_at=payment.created_at,
    )


# ------------------------------------------------------------------------------
# KHQR settlement of dine-in table sessions
# ------------------------------------------------------------------------------


async def _complete_session_khqr_payment(
    session: AsyncSession,
    *,
    table_sess: TableSession,
    quote: KHQRBillQuote,
    current_user: User,
    notes: str | None,
    attempt: KHQRPaymentAttempt | None,
    manual_reason: str | None = None,
    confirmed_by_role: str | None = None,
) -> PaymentResponse:
    """
    Record a KHQR payment for a locked dine-in session and close the session.

    Creates the Payment, links the attempt, closes the session, sets the table
    to DIRTY_CLEANING, marks the orders SERVED, writes the audit log and
    commits. Then broadcasts ``payment.completed`` and notifies Telegram.
    """
    now_utc = datetime.now(timezone.utc)
    table_session_id = table_sess.id
    business_id = table_sess.business_id
    branch_id = table_sess.branch_id
    attempt_status_before = attempt.status.value if attempt is not None else None

    payment = _new_khqr_payment(
        organization_id=table_sess.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
        order_id=None,
        quote=quote,
        current_user=current_user,
        notes=notes,
        attempt=attempt,
        manual_reason=manual_reason,
        settled_at=now_utc,
    )
    await _record_khqr_payment(session, payment, attempt, quote)

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

    details = _khqr_audit_details(
        payment, attempt, attempt_status_before, manual_reason, confirmed_by_role
    )
    details.update(
        {
            "table_session_id": str(table_session_id),
            "table_number": table.table_number if table else None,
        }
    )
    await record_audit_log(
        session=session,
        organization_id=table_sess.organization_id,
        user_id=current_user.id,
        action=_khqr_audit_action(manual_reason),
        resource_type="payment",
        resource_id=str(payment.id),
        details=details,
    )

    await session.commit()

    await ws_manager.broadcast_to_rooms(
        rooms=[f"branch:{branch_id}:pos", f"session:{table_session_id}"],
        event="payment.completed",
        data={
            "payment_id": str(payment.id),
            "payment_number": payment.payment_number,
            "payment_method": payment.payment_method.value,
            "payment_status": payment.payment_status.value,
            "grand_total_usd": str(payment.grand_total_usd),
            "grand_total_khr": int(payment.grand_total_khr),
            "table_session_id": str(table_session_id),
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
        grand_total_usd=float(payment.grand_total_usd),
        cashier_id=str(current_user.id),
        khqr_attempt_id=str(attempt.id) if attempt is not None else None,
        manual_override=manual_reason is not None,
    )

    return _khqr_payment_response(payment, table)


async def settle_table_session_khqr_payment(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    payload: KHQRPaymentRequest,
    current_user: User,
    tenant: TenantContext,
    bakong_client: BakongClient | None = None,
) -> PaymentResponse:
    """
    Settles a dine-in table session with a KHQR payment that Bakong confirmed.

    The payment attempt must belong to this session, be pending (or already
    confirmed but unsettled), and charge exactly the current bill, with the same
    discount, in its currency. A pending attempt is checked with Bakong (check
    transaction by MD5). Only when Bakong reports the money as received is the
    attempt marked SUCCEEDED and the Payment created with the Bakong transaction
    hash; the session is then closed as before (table DIRTY_CLEANING, audit log,
    WebSocket broadcast, Telegram notification).

    The session row and then the attempt row are locked (SELECT ... FOR UPDATE)
    and their status re-checked before anything is written, so a session or an
    attempt cannot be settled twice.

    Raises:
        TenantNotFoundError: If the session or attempt does not exist.
        ResourceConflictError: If the session or attempt was already settled, the
            attempt belongs to another bill, failed or was cancelled, or the
            bill no longer matches the KHQR amount.
        PaymentNotReceivedError: If Bakong has not received the payment yet.
        PaymentAttemptExpiredError: If the KHQR expired unpaid.
        PaymentProviderNotConfiguredError: If no Bakong API token is set.
        PaymentProviderUnavailableError: If Bakong cannot be reached.
    """
    table_sess = await _load_khqr_table_session(
        session, business_id, branch_id, table_session_id, tenant
    )
    _ensure_session_settleable(table_sess)

    attempt = await get_khqr_attempt(
        session,
        attempt_id=payload.attempt_id,
        business_id=business_id,
        branch_id=branch_id,
        organization_id=table_sess.organization_id,
    )
    ensure_attempt_targets(attempt, table_session_id=table_session_id)
    ensure_attempt_open(attempt)

    quote = await _quote_session_for_khqr(
        session, business_id, branch_id, table_session_id, payload, tenant
    )
    ensure_quote_matches_attempt(attempt, quote)

    check = await check_attempt_with_bakong(attempt, bakong_client)

    # Serialize settlements: lock the session row first, then the attempt row.
    table_sess = await _load_khqr_table_session(
        session, business_id, branch_id, table_session_id, tenant, lock=True
    )
    attempt = await confirm_attempt_under_lock(session, attempt.id, check)
    try:
        _ensure_session_settleable(table_sess)
        quote = await _quote_session_for_khqr(
            session, business_id, branch_id, table_session_id, payload, tenant
        )
        ensure_quote_matches_attempt(attempt, quote)
    except ResourceConflictError:
        # Bakong confirmed the money: keep that on the attempt for reconciliation.
        await session.commit()
        raise

    return await _complete_session_khqr_payment(
        session,
        table_sess=table_sess,
        quote=quote,
        current_user=current_user,
        notes=payload.notes,
        attempt=attempt,
    )


async def confirm_table_session_khqr_payment_manually(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    payload: KHQRManualConfirmationRequest,
    current_user: User,
    tenant: TenantContext,
) -> PaymentResponse:
    """
    Settles a dine-in session with a KHQR payment confirmed manually.

    For when Bakong verification is not configured, or as an override after an
    owner or manager checked the payment in a banking app. Requires the owner
    or manager role and a reason. The Payment is marked as manually confirmed
    and the action is recorded in the audit log as
    ``payment.khqr_manual_override``. When an attempt is given it must belong to
    this session and match the bill; it is then linked to the Payment.

    Raises:
        PermissionDeniedError: If the caller is not an owner or manager.
        TenantNotFoundError: If the session or attempt does not exist.
        ResourceConflictError: If the session or attempt was already settled, or
            the attempt belongs to another bill or does not match the bill.
    """
    confirmed_by_role = _ensure_can_confirm_khqr_manually(tenant, branch_id)

    table_sess = await _load_khqr_table_session(
        session, business_id, branch_id, table_session_id, tenant, lock=True
    )
    _ensure_session_settleable(table_sess)
    attempt = await _lock_attempt_for_manual_confirmation(
        session,
        payload.attempt_id,
        business_id=business_id,
        branch_id=branch_id,
        organization_id=tenant.organization_id,
        table_session_id=table_session_id,
    )

    quote = await _quote_session_for_khqr(
        session, business_id, branch_id, table_session_id, payload, tenant
    )
    if attempt is not None:
        ensure_quote_matches_attempt(attempt, quote)

    return await _complete_session_khqr_payment(
        session,
        table_sess=table_sess,
        quote=quote,
        current_user=current_user,
        notes=payload.notes,
        attempt=attempt,
        manual_reason=payload.reason,
        confirmed_by_role=confirmed_by_role,
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
    tenant: TenantContext,
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

    # 3. Evaluate Discount
    discount_usd, _, discount_reason_str = evaluate_manual_discount(
        subtotal_usd=bill.financials.subtotal_usd,
        manual_discount_type=payload.manual_discount_type,
        manual_discount_value=payload.manual_discount_value,
        discount_reason=payload.discount_reason,
    )

    if discount_usd > Decimal("0.00"):
        financials = await _discounted_financials(
            session=session,
            branch_id=branch_id,
            bill=bill,
            discount_usd=discount_usd,
        )
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
        discount_reason=discount_reason_str,
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
        discount_reason=payment.discount_reason,
        received_by_user_id=payment.received_by_user_id,
        notes=payment.notes,
        settled_at=payment.settled_at,
        created_at=payment.created_at,
    )


async def _complete_order_khqr_payment(
    session: AsyncSession,
    *,
    order: Order,
    quote: KHQRBillQuote,
    current_user: User,
    notes: str | None,
    attempt: KHQRPaymentAttempt | None,
    manual_reason: str | None = None,
    confirmed_by_role: str | None = None,
) -> PaymentResponse:
    """
    Record a KHQR payment for a locked single order and mark it SERVED.

    Creates the Payment, links the attempt, writes the audit log and commits.
    Then broadcasts ``payment.completed`` and notifies Telegram.
    """
    now_utc = datetime.now(timezone.utc)
    business_id = order.business_id
    branch_id = order.branch_id
    attempt_status_before = attempt.status.value if attempt is not None else None

    payment = _new_khqr_payment(
        organization_id=order.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=None,
        order_id=order.id,
        quote=quote,
        current_user=current_user,
        notes=notes,
        attempt=attempt,
        manual_reason=manual_reason,
        settled_at=now_utc,
    )
    await _record_khqr_payment(session, payment, attempt, quote)

    order.status = OrderStatus.SERVED

    details = _khqr_audit_details(
        payment, attempt, attempt_status_before, manual_reason, confirmed_by_role
    )
    details.update({"order_id": str(order.id), "order_number": order.order_number})
    await record_audit_log(
        session=session,
        organization_id=order.organization_id,
        user_id=current_user.id,
        action=_khqr_audit_action(manual_reason),
        resource_type="payment",
        resource_id=str(payment.id),
        details=details,
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

    logger.info(
        "KHQR payment settled successfully",
        payment_number=payment.payment_number,
        order_id=str(order.id),
        grand_total_usd=float(payment.grand_total_usd),
        cashier_id=str(current_user.id),
        khqr_attempt_id=str(attempt.id) if attempt is not None else None,
        manual_override=manual_reason is not None,
    )

    return _khqr_payment_response(payment, order.table)


async def settle_order_khqr_payment(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: KHQRPaymentRequest,
    current_user: User,
    tenant: TenantContext,
    bakong_client: BakongClient | None = None,
) -> PaymentResponse:
    """
    Settles a single/takeaway order with a KHQR payment that Bakong confirmed.

    Same rules as ``settle_table_session_khqr_payment``: the attempt must
    belong to this order, still be open and match the bill; a pending attempt
    is checked with Bakong; the order and attempt rows are locked before the
    Payment is created with the Bakong transaction hash.

    Raises:
        TenantNotFoundError: If the order or attempt does not exist.
        ResourceConflictError: If the order or attempt was already settled, the
            order was cancelled, the attempt belongs to another bill, failed or
            was cancelled, or the bill no longer matches the KHQR amount.
        PaymentNotReceivedError: If Bakong has not received the payment yet.
        PaymentAttemptExpiredError: If the KHQR expired unpaid.
        PaymentProviderNotConfiguredError: If no Bakong API token is set.
        PaymentProviderUnavailableError: If Bakong cannot be reached.
    """
    order = await _load_khqr_order(session, business_id, branch_id, order_id, tenant)
    _ensure_order_settleable(order)

    attempt = await get_khqr_attempt(
        session,
        attempt_id=payload.attempt_id,
        business_id=business_id,
        branch_id=branch_id,
        organization_id=order.organization_id,
    )
    ensure_attempt_targets(attempt, order_id=order_id)
    ensure_attempt_open(attempt)

    quote = await _quote_order_for_khqr(
        session, business_id, branch_id, order_id, payload, tenant
    )
    ensure_quote_matches_attempt(attempt, quote)

    check = await check_attempt_with_bakong(attempt, bakong_client)

    # Serialize settlements: lock the order row first, then the attempt row.
    order = await _load_khqr_order(
        session, business_id, branch_id, order_id, tenant, lock=True
    )
    attempt = await confirm_attempt_under_lock(session, attempt.id, check)
    try:
        _ensure_order_settleable(order)
        quote = await _quote_order_for_khqr(
            session, business_id, branch_id, order_id, payload, tenant
        )
        ensure_quote_matches_attempt(attempt, quote)
    except ResourceConflictError:
        # Bakong confirmed the money: keep that on the attempt for reconciliation.
        await session.commit()
        raise

    return await _complete_order_khqr_payment(
        session,
        order=order,
        quote=quote,
        current_user=current_user,
        notes=payload.notes,
        attempt=attempt,
    )


async def confirm_order_khqr_payment_manually(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    payload: KHQRManualConfirmationRequest,
    current_user: User,
    tenant: TenantContext,
) -> PaymentResponse:
    """
    Settles a single/takeaway order with a KHQR payment confirmed manually.

    Same rules as ``confirm_table_session_khqr_payment_manually``: owner or
    manager role and a reason are required, the Payment is marked as manually
    confirmed, and the override is audited as ``payment.khqr_manual_override``.

    Raises:
        PermissionDeniedError: If the caller is not an owner or manager.
        TenantNotFoundError: If the order or attempt does not exist.
        ResourceConflictError: If the order or attempt was already settled, the
            order was cancelled, or the attempt belongs to another bill or does
            not match the bill.
    """
    confirmed_by_role = _ensure_can_confirm_khqr_manually(tenant, branch_id)

    order = await _load_khqr_order(
        session, business_id, branch_id, order_id, tenant, lock=True
    )
    _ensure_order_settleable(order)
    attempt = await _lock_attempt_for_manual_confirmation(
        session,
        payload.attempt_id,
        business_id=business_id,
        branch_id=branch_id,
        organization_id=tenant.organization_id,
        order_id=order_id,
    )

    quote = await _quote_order_for_khqr(
        session, business_id, branch_id, order_id, payload, tenant
    )
    if attempt is not None:
        ensure_quote_matches_attempt(attempt, quote)

    return await _complete_order_khqr_payment(
        session,
        order=order,
        quote=quote,
        current_user=current_user,
        notes=payload.notes,
        attempt=attempt,
        manual_reason=payload.reason,
        confirmed_by_role=confirmed_by_role,
    )


# ==============================================================================
# 5. PAYMENT RECORD QUERIES & HISTORY RETRIEVAL
# ==============================================================================


async def get_payment_by_id(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    payment_id: UUID,
    tenant: TenantContext,
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
        discount_reason=payment.discount_reason,
        received_by_user_id=payment.received_by_user_id,
        notes=payment.notes,
        bakong_reference=payment.bakong_reference,
        is_manually_confirmed=payment.is_manually_confirmed,
        manual_confirmation_reason=payment.manual_confirmation_reason,
        settled_at=payment.settled_at,
        created_at=payment.created_at,
    )


# Backward-compatible aliases for endpoints & test callers
settle_single_order_cash_payment = settle_order_cash_payment
settle_single_order_khqr_payment = settle_order_khqr_payment
