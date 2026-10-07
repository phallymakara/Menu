"""
KHQR (Bakong) payment codes and payment attempt tracking.

Builds EMVCo KHQR Tag-Length-Value payloads with CRC16, records every dynamic
KHQR as a ``KHQRPaymentAttempt`` (amount, currency, payload, MD5 and expiry),
and confirms attempts through the Bakong Open API. A KHQR is only issued when
the branch or business has a real Bakong account configured.
"""

from __future__ import annotations

import base64
import hashlib
import io
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal, NoReturn
from uuid import UUID, uuid4

import qrcode
import structlog
from qrcode.constants import ERROR_CORRECT_M
from qrcode.image.pil import PilImage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    PaymentAccountNotConfiguredError,
    PaymentAttemptExpiredError,
    PaymentNotReceivedError,
    PaymentProviderNotConfiguredError,
    ResourceConflictError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.integrations.bakong import (
    BakongClient,
    BakongTransactionCheck,
    BakongTransactionStatus,
)
from app.models.branch import Branch
from app.models.enums import (
    DiscountType,
    KHQRPaymentAttemptStatus,
    OrderStatus,
    TableSessionStatus,
)
from app.models.khqr_payment_attempt import KHQRPaymentAttempt
from app.models.order import Order
from app.models.table_session import TableSession
from app.schemas.billing import BillFinancialBreakdown, BillSummaryResponse
from app.schemas.khqr import (
    DynamicKHQRResponse,
    KHQRPaymentAttemptResponse,
    KHQRResponse,
)
from app.services.billing_service import (
    _resolve_financial_settings,
    calculate_financial_breakdown,
    get_order_bill_summary,
    get_table_session_bill_summary,
)
from app.services.promotion_service import evaluate_discount
from app.services.tenancy import get_branch_for_tenant, get_business_for_tenant

logger = structlog.get_logger("app.services.khqr_service")

KHQRCurrency = Literal["USD", "KHR"]

_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
_CENT = Decimal("0.01")

# A dine-in session can be paid while open or after the guest asked for the bill.
_PAYABLE_SESSION_STATUSES = (
    TableSessionStatus.ACTIVE,
    TableSessionStatus.BILL_REQUESTED,
)

NO_BAKONG_ACCOUNT_MESSAGE = (
    "No Bakong account is configured for this branch or business. Add a Bakong "
    "account ID in the store settings before accepting KHQR payments."
)
VERIFICATION_NOT_CONFIGURED_MESSAGE = (
    "Bakong payment verification is not configured on this server. Ask an owner "
    "or manager to confirm the payment manually."
)
PAYMENT_NOT_RECEIVED_MESSAGE = (
    "Payment not received yet. Ask the customer to finish paying in their "
    "banking app, then try again."
)
ATTEMPT_EXPIRED_MESSAGE = (
    "This KHQR expired before Bakong received a payment. Generate a new KHQR."
)
_FAILURE_MESSAGES = {
    "bakong_reported_failure": (
        "Bakong reported that this KHQR payment failed. Generate a new KHQR."
    ),
    "bakong_amount_mismatch": (
        "Bakong reported a payment that does not match the amount or currency "
        "of this KHQR. Check the payment with a manager."
    ),
}


# ==============================================================================
# 1. KHQR PAYLOAD ENCODING
# ==============================================================================


def calculate_crc16(data: str) -> str:
    """
    Calculates the CRC16-CCITT (polynomial 0x1021, initial 0xFFFF)
    checksum formatted as a 4-character uppercase hexadecimal string.
    """
    crc = 0xFFFF
    for byte in data.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def format_tlv(tag: str, value: str) -> str:
    """Formats a Tag-Length-Value (TLV) entry compliant with EMVCo specification."""
    val_bytes = value.encode("utf-8")
    length = len(val_bytes)
    return f"{tag}{length:02d}{value}"


def _epoch_millis(moment: datetime) -> int:
    """Return a timestamp in whole milliseconds since the Unix epoch (UTC)."""
    return (_as_utc(moment) - _EPOCH) // timedelta(milliseconds=1)


def _timestamp_template(created_at: datetime, expires_at: datetime) -> str:
    """
    Encode the KHQR timestamp template (tag 99).

    Sub-tag 00 is the creation time and sub-tag 01 the expiration time, both in
    epoch milliseconds, as the NBC KHQR SDK writes them for dynamic KHQR.
    """
    created_ms = _epoch_millis(created_at)
    expires_ms = _epoch_millis(expires_at)
    if expires_ms <= created_ms:
        raise ValueError("A KHQR must expire after it is created.")
    return format_tlv(
        "99",
        format_tlv("00", str(created_ms)) + format_tlv("01", str(expires_ms)),
    )


def build_khqr_payload(
    bakong_account_id: str,
    merchant_name: str,
    merchant_city: str = "Phnom Penh",
    acquiring_bank: str | None = None,
    amount: Decimal | None = None,
    currency: KHQRCurrency = "USD",
    bill_number: str | None = None,
    terminal_label: str | None = None,
    is_dynamic: bool = True,
    created_at: datetime | None = None,
    expires_at: datetime | None = None,
) -> str:
    """
    Encodes a standard EMVCo Tag-Length-Value (TLV) KHQR string.

    For a dynamic KHQR, ``expires_at`` adds the timestamp template (tag 99) with
    the creation time (``created_at``, default now) and the expiration time.
    Banking apps refuse to pay a dynamic KHQR after it expires.
    """
    payload_parts = [
        format_tlv("00", "01"),  # Format indicator
        format_tlv("01", "12" if is_dynamic else "11"),  # 12 = Dynamic, 11 = Static
    ]

    # Tag 29: Merchant Account Information (Bakong)
    merchant_account_subtags = [
        format_tlv("00", bakong_account_id.strip()),
    ]
    if acquiring_bank:
        merchant_account_subtags.append(format_tlv("01", acquiring_bank.strip()))
    merchant_account_str = "".join(merchant_account_subtags)
    payload_parts.append(format_tlv("29", merchant_account_str))

    # Tag 52: Merchant Category Code (MCC - 5812: Eating places & Restaurants)
    payload_parts.append(format_tlv("52", "5812"))

    # Tag 53: Transaction Currency (840 = USD, 116 = KHR)
    currency_code = "840" if currency == "USD" else "116"
    payload_parts.append(format_tlv("53", currency_code))

    # Tag 54: Transaction Amount (if dynamic)
    if is_dynamic and amount is not None:
        if currency == "USD":
            amount_str = f"{amount:.2f}"
        else:
            amount_str = f"{int(round(float(amount)))}"
        payload_parts.append(format_tlv("54", amount_str))

    # Tag 58: Country Code (KH)
    payload_parts.append(format_tlv("58", "KH"))

    # Tag 59: Merchant Name (max 25 chars for standard EMVCo display)
    safe_name = (merchant_name.strip()[:25]) if merchant_name else "Merchant"
    payload_parts.append(format_tlv("59", safe_name))

    # Tag 60: Merchant City (default Phnom Penh, max 15 chars)
    safe_city = (merchant_city.strip()[:15]) if merchant_city else "Phnom Penh"
    payload_parts.append(format_tlv("60", safe_city))

    # Tag 62: Additional Data Field Template (Bill/Invoice Reference)
    additional_subtags = []
    if bill_number:
        additional_subtags.append(format_tlv("01", bill_number.strip()[:25]))
    if terminal_label:
        additional_subtags.append(format_tlv("07", terminal_label.strip()[:25]))
    if additional_subtags:
        payload_parts.append(format_tlv("62", "".join(additional_subtags)))

    # Tag 99: KHQR timestamp template (creation and expiration, dynamic only)
    if is_dynamic and expires_at is not None:
        payload_parts.append(
            _timestamp_template(created_at or datetime.now(timezone.utc), expires_at)
        )

    # Tag 63: Checksum header
    incomplete_payload = "".join(payload_parts) + "6304"
    crc = calculate_crc16(incomplete_payload)

    return incomplete_payload + crc


def compute_khqr_md5(qr_string: str) -> str:
    """
    Return the MD5 that Bakong uses to identify a KHQR.

    It is the lowercase hex MD5 of the complete KHQR string (UTF-8, CRC
    included), as the NBC KHQR SDK computes it. It is an identifier, not a
    security control.
    """
    return hashlib.md5(qr_string.encode("utf-8"), usedforsecurity=False).hexdigest()


def generate_qr_image_data_url(qr_string: str) -> str:
    """Generates a high-contrast Base64 PNG Data URI for the given QR string."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(qr_string)
    qr.make(fit=True)
    img = qr.make_image(image_factory=PilImage, fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"


# ==============================================================================
# 2. MERCHANT ACCOUNT RESOLUTION
# ==============================================================================


def _clean(value: str | None) -> str | None:
    """Return a stripped string, or ``None`` when it is empty."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


async def _resolve_bakong_merchant_info(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
) -> tuple[str, str, str, str | None]:
    """
    Resolves Bakong merchant settings field by field: branch override, then business.

    Returns:
        (bakong_account_id, merchant_name, merchant_city, acquiring_bank)

    The business and branch are resolved within the caller's organization.

    Raises:
        TenantNotFoundError: If the branch or business is not part of the tenant.
        PaymentAccountNotConfiguredError: If neither the branch nor the business
            has a Bakong account ID. A KHQR is never issued to an invented account.
    """
    branch = await get_branch_for_tenant(session, tenant, business_id, branch_id)
    biz = await get_business_for_tenant(session, tenant, business_id)

    account_id = _clean(branch.bakong_account_id if branch else None) or _clean(
        biz.bakong_account_id if biz else None
    )
    if account_id is None:
        logger.warning(
            "KHQR refused: no Bakong account configured",
            business_id=str(business_id),
            branch_id=str(branch_id),
        )
        raise PaymentAccountNotConfiguredError(NO_BAKONG_ACCOUNT_MESSAGE)

    merchant_name = (
        _clean(branch.bakong_merchant_name if branch else None)
        or _clean(biz.bakong_merchant_name if biz else None)
        or _clean(branch.name_en if branch else None)
        or _clean(biz.name_en if biz else None)
        or "Restaurant"
    )
    merchant_city = (
        _clean(branch.bakong_merchant_city if branch else None)
        or _clean(biz.bakong_merchant_city if biz else None)
        or "Phnom Penh"
    )
    acquiring_bank = _clean(branch.bakong_acquiring_bank if branch else None) or _clean(
        biz.bakong_acquiring_bank if biz else None
    )

    return account_id, merchant_name, merchant_city, acquiring_bank


# ==============================================================================
# 3. BILL QUOTES
# ==============================================================================


@dataclass(frozen=True, slots=True)
class KHQRBillQuote:
    """Bill totals a KHQR charges for, after any discount."""

    bill: BillSummaryResponse
    financials: BillFinancialBreakdown
    promotion_id: UUID | None
    discount_reason: str | None

    def payable_amount(self, currency: str) -> Decimal:
        """Amount due in ``currency``: USD to the cent, KHR in whole riel."""
        if currency == "KHR":
            return Decimal(self.financials.grand_total_khr)
        return self.financials.grand_total_usd.quantize(_CENT)


async def _quote_bill(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    bill: BillSummaryResponse,
    promo_code: str | None,
    manual_discount_type: DiscountType | None,
    manual_discount_value: Decimal | None,
    discount_reason: str | None,
    tenant: TenantContext,
) -> KHQRBillQuote:
    """
    Apply a promotion or manual discount to a bill.

    Uses the bill's own tax and service-charge rates and exchange rate, with the
    inclusive flags of the branch, exactly like cash settlement does, so the
    KHQR amount and the settled Payment always agree.
    """
    eval_result = await evaluate_discount(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        subtotal_usd=bill.financials.subtotal_usd,
        promo_code=promo_code,
        manual_discount_type=manual_discount_type,
        manual_discount_value=manual_discount_value,
        discount_reason=discount_reason,
        tenant=tenant,
    )

    if eval_result.discount_usd > Decimal("0.00"):
        _, _, _, is_tax_inclusive, is_sc_inclusive = await _resolve_financial_settings(
            session=session,
            branch_id=branch_id,
            table_id=bill.table_id,
        )
        financials = calculate_financial_breakdown(
            subtotal_usd=bill.financials.subtotal_usd,
            tax_pct=bill.financials.tax_percent,
            sc_pct=bill.financials.service_charge_percent,
            exchange_rate=bill.financials.exchange_rate,
            discount_usd=eval_result.discount_usd,
            is_tax_inclusive=is_tax_inclusive,
            is_sc_inclusive=is_sc_inclusive,
        )
    else:
        financials = bill.financials

    return KHQRBillQuote(
        bill=bill,
        financials=financials,
        promotion_id=eval_result.promotion_id,
        discount_reason=eval_result.discount_reason,
    )


async def quote_table_session_bill(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    *,
    promo_code: str | None = None,
    manual_discount_type: DiscountType | None = None,
    manual_discount_value: Decimal | None = None,
    discount_reason: str | None = None,
    tenant: TenantContext,
) -> KHQRBillQuote:
    """Compute what a dine-in session bill costs after the given discount."""
    bill = await get_table_session_bill_summary(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
        tenant=tenant,
    )
    return await _quote_bill(
        session,
        business_id,
        branch_id,
        bill,
        promo_code,
        manual_discount_type,
        manual_discount_value,
        discount_reason,
        tenant,
    )


async def quote_order_bill(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    *,
    promo_code: str | None = None,
    manual_discount_type: DiscountType | None = None,
    manual_discount_value: Decimal | None = None,
    discount_reason: str | None = None,
    tenant: TenantContext,
) -> KHQRBillQuote:
    """Compute what a standalone order costs after the given discount."""
    bill = await get_order_bill_summary(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        tenant=tenant,
    )
    return await _quote_bill(
        session,
        business_id,
        branch_id,
        bill,
        promo_code,
        manual_discount_type,
        manual_discount_value,
        discount_reason,
        tenant,
    )


# ==============================================================================
# 4. DYNAMIC AND STATIC KHQR GENERATION
# ==============================================================================


async def _get_payable_table_session(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    tenant: TenantContext,
) -> TableSession:
    """Load a table session of the tenant that can still be paid."""
    query = select(TableSession).where(
        TableSession.id == table_session_id,
        TableSession.business_id == business_id,
        TableSession.branch_id == branch_id,
    )
    query = query.where(TableSession.organization_id == tenant.organization_id)
    table_sess = (await session.execute(query)).scalar_one_or_none()
    if table_sess is None:
        raise TenantNotFoundError("Table dining session not found.")
    if table_sess.status == TableSessionStatus.COMPLETED:
        raise ResourceConflictError("This table session has already been settled.")
    if table_sess.status not in _PAYABLE_SESSION_STATUSES:
        raise ResourceConflictError("This table session is not open for payment.")
    return table_sess


async def _get_payable_order(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    tenant: TenantContext,
) -> Order:
    """Load an order of the tenant that can still be paid."""
    query = select(Order).where(
        Order.id == order_id,
        Order.business_id == business_id,
        Order.branch_id == branch_id,
    )
    query = query.where(Order.organization_id == tenant.organization_id)
    order = (await session.execute(query)).scalar_one_or_none()
    if order is None:
        raise TenantNotFoundError("Order not found.")
    if order.status == OrderStatus.SERVED:
        raise ResourceConflictError("This order has already been settled.")
    if order.status == OrderStatus.CANCELLED:
        raise ResourceConflictError("This order has been cancelled.")
    return order


async def _issue_dynamic_khqr(
    session: AsyncSession,
    *,
    organization_id: UUID,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID | None,
    order_id: UUID | None,
    merchant: tuple[str, str, str, str | None],
    quote: KHQRBillQuote,
    currency: KHQRCurrency,
    bill_prefix: str,
    terminal_label: str,
    created_by_user_id: UUID | None,
) -> DynamicKHQRResponse:
    """
    Build a dynamic KHQR, store it as a pending payment attempt, and return it.

    The bill number (tag 62) combines the bill and the attempt, for example
    ``SES-1A2B3C4D-5E6F7A``, so every generated KHQR, and therefore its MD5, is
    unique, as the NBC integration guide requires of the transaction ID.
    """
    account_id, merchant_name, merchant_city, acquiring_bank = merchant
    amount = quote.payable_amount(currency)
    if amount <= Decimal("0"):
        raise ResourceConflictError(
            "This bill has no amount due, so no KHQR can be generated."
        )

    attempt_id = uuid4()
    target_id = table_session_id or order_id
    target_ref = target_id.hex[:8].upper() if target_id else "POS"
    bill_reference = f"{bill_prefix}-{target_ref}-{attempt_id.hex[:6].upper()}"
    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(seconds=settings.khqr_expiration_seconds)
    qr_str = build_khqr_payload(
        bakong_account_id=account_id,
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        acquiring_bank=acquiring_bank,
        amount=amount,
        currency=currency,
        bill_number=bill_reference,
        terminal_label=terminal_label,
        is_dynamic=True,
        created_at=created_at,
        expires_at=expires_at,
    )

    attempt = KHQRPaymentAttempt(
        id=attempt_id,
        organization_id=organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
        order_id=order_id,
        amount=amount,
        currency=currency,
        qr_payload=qr_str,
        md5=compute_khqr_md5(qr_str),
        status=KHQRPaymentAttemptStatus.PENDING,
        expires_at=expires_at,
        created_by_user_id=created_by_user_id,
    )
    session.add(attempt)
    await session.commit()

    logger.info(
        "KHQR payment attempt created",
        attempt_id=str(attempt.id),
        branch_id=str(branch_id),
        table_session_id=str(table_session_id) if table_session_id else None,
        order_id=str(order_id) if order_id else None,
        currency=currency,
        amount=str(amount),
        expires_at=expires_at.isoformat(),
    )

    return DynamicKHQRResponse(
        qr_string=qr_str,
        qr_image_data_url=generate_qr_image_data_url(qr_str),
        currency=currency,
        amount=amount,
        amount_usd=quote.financials.grand_total_usd,
        amount_khr=quote.financials.grand_total_khr,
        exchange_rate=quote.financials.exchange_rate,
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        bakong_account_id=account_id,
        bill_reference=bill_reference,
        deep_link_url=f"bakong://qr?data={qr_str}",
        attempt_id=attempt.id,
        md5=attempt.md5,
        expires_at=expires_at,
        status=attempt.status,
    )


async def generate_dynamic_session_khqr(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    currency: KHQRCurrency = "USD",
    promo_code: str | None = None,
    manual_discount_type: DiscountType | None = None,
    manual_discount_value: Decimal | None = None,
    discount_reason: str | None = None,
    created_by_user_id: UUID | None = None,
) -> DynamicKHQRResponse:
    """
    Generates a dynamic KHQR for a dine-in session bill and records the attempt.

    Raises:
        TenantNotFoundError: If the session does not exist for this tenant.
        ResourceConflictError: If the session is settled or closed, or nothing is due.
        PaymentAccountNotConfiguredError: If no Bakong account is configured.
    """
    table_sess = await _get_payable_table_session(
        session, business_id, branch_id, table_session_id, tenant
    )
    merchant = await _resolve_bakong_merchant_info(
        session, tenant, business_id, branch_id
    )
    quote = await quote_table_session_bill(
        session,
        business_id,
        branch_id,
        table_session_id,
        promo_code=promo_code,
        manual_discount_type=manual_discount_type,
        manual_discount_value=manual_discount_value,
        discount_reason=discount_reason,
        tenant=tenant,
    )
    table_number = quote.bill.table_number
    return await _issue_dynamic_khqr(
        session,
        organization_id=table_sess.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
        order_id=None,
        merchant=merchant,
        quote=quote,
        currency=currency,
        bill_prefix="SES",
        terminal_label=f"T-{table_number}" if table_number else "POS",
        created_by_user_id=created_by_user_id,
    )


async def generate_dynamic_order_khqr(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    currency: KHQRCurrency = "USD",
    promo_code: str | None = None,
    manual_discount_type: DiscountType | None = None,
    manual_discount_value: Decimal | None = None,
    discount_reason: str | None = None,
    created_by_user_id: UUID | None = None,
) -> DynamicKHQRResponse:
    """
    Generates a dynamic KHQR for a takeaway or single order and records the attempt.

    Raises:
        TenantNotFoundError: If the order does not exist for this tenant.
        ResourceConflictError: If the order is settled or cancelled, or nothing is due.
        PaymentAccountNotConfiguredError: If no Bakong account is configured.
    """
    order = await _get_payable_order(session, business_id, branch_id, order_id, tenant)
    merchant = await _resolve_bakong_merchant_info(
        session, tenant, business_id, branch_id
    )
    quote = await quote_order_bill(
        session,
        business_id,
        branch_id,
        order_id,
        promo_code=promo_code,
        manual_discount_type=manual_discount_type,
        manual_discount_value=manual_discount_value,
        discount_reason=discount_reason,
        tenant=tenant,
    )
    return await _issue_dynamic_khqr(
        session,
        organization_id=order.organization_id,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=None,
        order_id=order_id,
        merchant=merchant,
        quote=quote,
        currency=currency,
        bill_prefix="ORD",
        terminal_label="POS",
        created_by_user_id=created_by_user_id,
    )


async def generate_static_merchant_khqr(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    currency: KHQRCurrency = "USD",
) -> KHQRResponse:
    """
    Generates a static merchant KHQR for table stands or counter stickers.

    A static KHQR has no amount and is not tracked as a payment attempt: Bakong's
    MD5 check only covers dynamic KHQR, so payments to it need a manual
    confirmation before a bill can be settled.

    Raises:
        TenantNotFoundError: If the branch does not exist for this tenant.
        PaymentAccountNotConfiguredError: If no Bakong account is configured.
    """
    branch_query = select(Branch).where(
        Branch.id == branch_id, Branch.business_id == business_id
    )
    branch_query = branch_query.where(Branch.organization_id == tenant.organization_id)
    if (await session.execute(branch_query)).scalar_one_or_none() is None:
        raise TenantNotFoundError("Branch not found.")

    (
        account_id,
        merchant_name,
        merchant_city,
        acquiring_bank,
    ) = await _resolve_bakong_merchant_info(session, tenant, business_id, branch_id)

    qr_str = build_khqr_payload(
        bakong_account_id=account_id,
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        acquiring_bank=acquiring_bank,
        amount=None,
        currency=currency,
        bill_number=None,
        terminal_label="STATIC",
        is_dynamic=False,
    )

    return KHQRResponse(
        qr_string=qr_str,
        qr_image_data_url=generate_qr_image_data_url(qr_str),
        currency=currency,
        amount=Decimal("0"),
        amount_usd=Decimal("0"),
        amount_khr=0,
        exchange_rate=Decimal("4100"),
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        bakong_account_id=account_id,
        bill_reference="STATIC-MERCHANT",
        deep_link_url=f"bakong://qr?data={qr_str}",
    )


# ==============================================================================
# 5. PAYMENT ATTEMPT VERIFICATION
# ==============================================================================


def _as_utc(value: datetime) -> datetime:
    """Treat naive datetimes (as SQLite returns them) as UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _khqr_currency(value: str) -> KHQRCurrency:
    """Narrow a stored currency code to the KHQR currencies."""
    if value == "USD":
        return "USD"
    if value == "KHR":
        return "KHR"
    raise ValueError(f"Unsupported KHQR currency: {value}")


def is_attempt_expired(
    attempt: KHQRPaymentAttempt, now: datetime | None = None
) -> bool:
    """Return True once the KHQR of the attempt can no longer be paid."""
    moment = now or datetime.now(timezone.utc)
    return moment >= _as_utc(attempt.expires_at)


async def get_khqr_attempt(
    session: AsyncSession,
    *,
    attempt_id: UUID,
    business_id: UUID,
    branch_id: UUID,
    organization_id: UUID | None = None,
) -> KHQRPaymentAttempt:
    """
    Load a payment attempt of a branch, scoped to the organization when given.

    Raises:
        TenantNotFoundError: If the attempt does not exist in this scope.
    """
    query = select(KHQRPaymentAttempt).where(
        KHQRPaymentAttempt.id == attempt_id,
        KHQRPaymentAttempt.business_id == business_id,
        KHQRPaymentAttempt.branch_id == branch_id,
    )
    if organization_id is not None:
        query = query.where(KHQRPaymentAttempt.organization_id == organization_id)
    attempt = (await session.execute(query)).scalar_one_or_none()
    if attempt is None:
        raise TenantNotFoundError("KHQR payment attempt not found.")
    return attempt


async def lock_khqr_attempt(
    session: AsyncSession, attempt_id: UUID
) -> KHQRPaymentAttempt:
    """
    Re-read an attempt under a row lock (SELECT ... FOR UPDATE).

    The fresh row replaces any copy already loaded in the session. SQLite has no
    row locks, so there the statement is a plain SELECT.
    """
    result = await session.execute(
        select(KHQRPaymentAttempt)
        .where(KHQRPaymentAttempt.id == attempt_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


def ensure_attempt_targets(
    attempt: KHQRPaymentAttempt,
    *,
    table_session_id: UUID | None = None,
    order_id: UUID | None = None,
) -> None:
    """
    Check that the attempt was generated for this bill.

    Raises:
        ResourceConflictError: If it belongs to another session or order.
    """
    if attempt.table_session_id != table_session_id or attempt.order_id != order_id:
        raise ResourceConflictError(
            "This KHQR payment attempt was generated for a different bill."
        )


def raise_for_unpaid_attempt(attempt: KHQRPaymentAttempt) -> NoReturn:
    """Raise the domain error that explains why an attempt cannot settle a bill."""
    if attempt.status == KHQRPaymentAttemptStatus.PENDING:
        raise PaymentNotReceivedError(PAYMENT_NOT_RECEIVED_MESSAGE)
    if attempt.status == KHQRPaymentAttemptStatus.EXPIRED:
        raise PaymentAttemptExpiredError(ATTEMPT_EXPIRED_MESSAGE)
    if attempt.status == KHQRPaymentAttemptStatus.FAILED:
        raise ResourceConflictError(
            _FAILURE_MESSAGES.get(
                attempt.failure_reason or "",
                "This KHQR payment attempt failed. Generate a new KHQR.",
            )
        )
    if attempt.status == KHQRPaymentAttemptStatus.CANCELLED:
        raise ResourceConflictError(
            "This KHQR payment attempt was cancelled. Generate a new KHQR."
        )
    raise ResourceConflictError("This KHQR payment attempt cannot settle the bill.")


def ensure_attempt_open(attempt: KHQRPaymentAttempt) -> None:
    """
    Reject attempts that can no longer settle a bill.

    Pending attempts and attempts Bakong already confirmed (but that are not yet
    linked to a Payment) pass.
    """
    if attempt.payment_id is not None:
        raise ResourceConflictError(
            "This KHQR payment attempt has already been settled."
        )
    if attempt.status not in (
        KHQRPaymentAttemptStatus.PENDING,
        KHQRPaymentAttemptStatus.SUCCEEDED,
    ):
        raise_for_unpaid_attempt(attempt)


def ensure_quote_matches_attempt(
    attempt: KHQRPaymentAttempt, quote: KHQRBillQuote
) -> None:
    """
    Check that the bill still costs exactly what the KHQR charges.

    Raises:
        ResourceConflictError: If the bill total (after discount) changed since
            the KHQR was generated.
    """
    bill_amount = quote.payable_amount(attempt.currency)
    if bill_amount != attempt.amount:
        logger.warning(
            "KHQR settlement rejected: bill total differs from the KHQR amount",
            attempt_id=str(attempt.id),
            currency=attempt.currency,
            khqr_amount=str(attempt.amount),
            bill_amount=str(bill_amount),
        )
        raise ResourceConflictError(
            "The bill total no longer matches the amount of this KHQR. Generate a "
            "new KHQR for the current total."
        )


async def check_attempt_with_bakong(
    attempt: KHQRPaymentAttempt, bakong_client: BakongClient | None
) -> BakongTransactionCheck | None:
    """
    Ask Bakong about a pending attempt.

    Returns:
        Bakong's answer, or ``None`` when the attempt is not pending (Bakong
        already confirmed it).

    Raises:
        PaymentProviderNotConfiguredError: If no Bakong API token is configured.
        PaymentProviderUnavailableError: If Bakong gives no usable answer.
    """
    if attempt.status != KHQRPaymentAttemptStatus.PENDING:
        return None
    if bakong_client is None:
        logger.warning(
            "KHQR verification skipped: Bakong API token not configured",
            attempt_id=str(attempt.id),
        )
        raise PaymentProviderNotConfiguredError(VERIFICATION_NOT_CONFIGURED_MESSAGE)
    return await bakong_client.check_transaction_by_md5(attempt.md5)


def _bakong_amount_matches(
    attempt: KHQRPaymentAttempt, check: BakongTransactionCheck
) -> bool:
    """Return True when Bakong reports exactly the amount and currency of the KHQR."""
    return (
        check.amount is not None
        and check.currency == attempt.currency
        and check.amount == attempt.amount
    )


def apply_bakong_check(
    attempt: KHQRPaymentAttempt,
    check: BakongTransactionCheck,
    now: datetime,
) -> None:
    """
    Move an attempt to the state Bakong reports.

    Only pending attempts change, with one exception: a payment Bakong confirms
    also wins over a time-out recorded concurrently, because banking apps refuse
    to pay an expired KHQR, so the payment was made in time.

    - paid, same amount and currency: SUCCEEDED with the transaction hash
    - paid, different amount or currency: FAILED (needs a manager)
    - failed: FAILED
    - not found after the expiry: EXPIRED (still pending before it)
    """
    if check.status == BakongTransactionStatus.PAID:
        if attempt.status not in (
            KHQRPaymentAttemptStatus.PENDING,
            KHQRPaymentAttemptStatus.EXPIRED,
        ):
            return
        attempt.bakong_reference = check.transaction_hash
        if _bakong_amount_matches(attempt, check):
            attempt.status = KHQRPaymentAttemptStatus.SUCCEEDED
            attempt.verified_at = now
            attempt.failure_reason = None
            logger.info(
                "KHQR payment confirmed by Bakong",
                attempt_id=str(attempt.id),
                bakong_reference=check.transaction_hash,
            )
        else:
            attempt.status = KHQRPaymentAttemptStatus.FAILED
            attempt.failure_reason = "bakong_amount_mismatch"
            logger.warning(
                "Bakong reported a payment that does not match the KHQR",
                attempt_id=str(attempt.id),
                currency=attempt.currency,
                khqr_amount=str(attempt.amount),
                bakong_currency=check.currency,
                bakong_amount=str(check.amount),
            )
        return

    if attempt.status != KHQRPaymentAttemptStatus.PENDING:
        return
    if check.status == BakongTransactionStatus.FAILED:
        attempt.status = KHQRPaymentAttemptStatus.FAILED
        attempt.failure_reason = "bakong_reported_failure"
        logger.warning(
            "Bakong reported a failed KHQR payment", attempt_id=str(attempt.id)
        )
    elif is_attempt_expired(attempt, now):
        attempt.status = KHQRPaymentAttemptStatus.EXPIRED
        logger.info("KHQR payment attempt expired unpaid", attempt_id=str(attempt.id))


async def confirm_attempt_under_lock(
    session: AsyncSession,
    attempt_id: UUID,
    check: BakongTransactionCheck | None,
) -> KHQRPaymentAttempt:
    """
    Lock the attempt, record Bakong's answer, and require a confirmed payment.

    Must run after the bill row was locked, so concurrent settlements of the
    same bill or attempt are serialized.

    Returns:
        The locked attempt, SUCCEEDED and not yet linked to a Payment.

    Raises:
        ResourceConflictError: If the attempt already settled a bill, failed, or
            was cancelled.
        PaymentNotReceivedError: If Bakong has not received the payment yet.
        PaymentAttemptExpiredError: If the KHQR expired unpaid.
    """
    attempt = await lock_khqr_attempt(session, attempt_id)
    if attempt.payment_id is not None:
        raise ResourceConflictError(
            "This KHQR payment attempt has already been settled."
        )
    if check is not None:
        apply_bakong_check(attempt, check, datetime.now(timezone.utc))
    if attempt.status != KHQRPaymentAttemptStatus.SUCCEEDED:
        # Keep FAILED or EXPIRED outcomes before refusing the settlement.
        await session.commit()
        logger.warning(
            "KHQR settlement rejected: payment not confirmed",
            attempt_id=str(attempt.id),
            attempt_status=attempt.status.value,
        )
        raise_for_unpaid_attempt(attempt)
    return attempt


def build_attempt_response(
    attempt: KHQRPaymentAttempt, *, verification_available: bool
) -> KHQRPaymentAttemptResponse:
    """Serialize a payment attempt for API clients (the QR payload is omitted)."""
    return KHQRPaymentAttemptResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        table_session_id=attempt.table_session_id,
        order_id=attempt.order_id,
        amount=attempt.amount,
        currency=_khqr_currency(attempt.currency),
        md5=attempt.md5,
        expires_at=_as_utc(attempt.expires_at),
        verified_at=_as_utc(attempt.verified_at) if attempt.verified_at else None,
        bakong_reference=attempt.bakong_reference,
        failure_reason=attempt.failure_reason,
        payment_id=attempt.payment_id,
        created_at=_as_utc(attempt.created_at),
        verification_available=verification_available,
    )


async def refresh_khqr_attempt(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    attempt_id: UUID,
    tenant: TenantContext,
    bakong_client: BakongClient | None = None,
) -> KHQRPaymentAttemptResponse:
    """
    Return a payment attempt, refreshing a pending one from Bakong.

    A pending attempt is checked with ``check_transaction_by_md5`` and becomes
    SUCCEEDED, FAILED or (when still unpaid after its expiry) EXPIRED. Without a
    Bakong token the stored state is returned unchanged, with
    ``verification_available`` set to false. Refreshing never creates a Payment.

    Raises:
        TenantNotFoundError: If the attempt does not exist for this tenant.
        PaymentProviderUnavailableError: If Bakong gives no usable answer.
    """
    attempt = await get_khqr_attempt(
        session,
        attempt_id=attempt_id,
        business_id=business_id,
        branch_id=branch_id,
        organization_id=tenant.organization_id,
    )

    if attempt.status == KHQRPaymentAttemptStatus.PENDING and bakong_client is not None:
        check = await bakong_client.check_transaction_by_md5(attempt.md5)
        attempt = await lock_khqr_attempt(session, attempt.id)
        apply_bakong_check(attempt, check, datetime.now(timezone.utc))
        await session.commit()

    return build_attempt_response(
        attempt, verification_available=bakong_client is not None
    )
