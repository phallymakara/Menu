from __future__ import annotations

import base64
import io
from decimal import Decimal
from typing import Literal
from uuid import UUID

import qrcode
import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import DiscountType
from app.schemas.khqr import KHQRResponse
from app.services.billing_service import (
    calculate_financial_breakdown,
    get_order_bill_summary,
    get_table_session_bill_summary,
)
from app.services.promotion_service import evaluate_discount

logger = structlog.get_logger("app.services.khqr_service")


def calculate_crc16(data: str) -> str:
    """
    Calculates the CRC16-CCITT (polynomial 0x1021, initial 0xFFFF)
    checksum formatted as a 4-character uppercase hexadecimal string.
    """
    crc = 0xFFFF
    for byte in data.encode("utf-8"):
        crc ^= (byte << 8)
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


def build_khqr_payload(
    bakong_account_id: str,
    merchant_name: str,
    merchant_city: str = "Phnom Penh",
    acquiring_bank: str | None = None,
    amount: Decimal | None = None,
    currency: Literal["USD", "KHR"] = "USD",
    bill_number: str | None = None,
    terminal_label: str | None = None,
    is_dynamic: bool = True,
) -> str:
    """
    Encodes a standard EMVCo Tag-Length-Value (TLV) KHQR string.
    """
    payload_parts = [
        format_tlv("00", "01"),  # Format indicator
        format_tlv("01", "12" if is_dynamic else "11"),  # 12 = Dynamic, 11 = Static
    ]

    # Tag 29: Merchant Account Information (Bakong)
    merchant_account_subtags = [
        format_tlv("00", bakong_account_id),
    ]
    if acquiring_bank:
        merchant_account_subtags.append(format_tlv("01", acquiring_bank))
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
            amount_str = f"{int(amount)}"
        payload_parts.append(format_tlv("54", amount_str))

    # Tag 58: Country Code (KH)
    payload_parts.append(format_tlv("58", "KH"))

    # Tag 59: Merchant Name (max 25 chars for standard EMVCo display)
    safe_name = merchant_name[:25] if merchant_name else "Merchant"
    payload_parts.append(format_tlv("59", safe_name))

    # Tag 60: Merchant City (default Phnom Penh)
    safe_city = merchant_city[:15] if merchant_city else "Phnom Penh"
    payload_parts.append(format_tlv("60", safe_city))

    # Tag 62: Additional Data Field Template (Bill/Invoice Reference)
    additional_subtags = []
    if bill_number:
        additional_subtags.append(format_tlv("01", bill_number[:25]))
    if terminal_label:
        additional_subtags.append(format_tlv("07", terminal_label[:25]))
    if additional_subtags:
        payload_parts.append(format_tlv("62", "".join(additional_subtags)))

    # Tag 63: Checksum header
    incomplete_payload = "".join(payload_parts) + "6304"
    crc = calculate_crc16(incomplete_payload)

    return incomplete_payload + crc


def generate_qr_image_data_url(qr_string: str) -> str:
    """Generates a high-contrast Base64 PNG Data URI for the given QR string."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(qr_string)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"


async def _resolve_bakong_merchant_info(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
) -> tuple[str, str, str, str | None]:
    """
    Resolves Bakong merchant settings:
    Branch override -> Business default -> Fallback default.
    Returns: (bakong_account_id, merchant_name, merchant_city, acquiring_bank)
    """
    branch_res = await session.execute(select(Branch).where(Branch.id == branch_id))
    branch = branch_res.scalar_one_or_none()

    biz_res = await session.execute(select(Business).where(Business.id == business_id))
    biz = biz_res.scalar_one_or_none()

    account_id = None
    merchant_name = None
    merchant_city = "Phnom Penh"
    acquiring_bank = None

    if branch:
        account_id = branch.bakong_account_id
        merchant_name = branch.bakong_merchant_name or branch.name_en
        merchant_city = branch.bakong_merchant_city or "Phnom Penh"
        acquiring_bank = branch.bakong_acquiring_bank

    if not account_id and biz:
        account_id = biz.bakong_account_id
        merchant_name = biz.bakong_merchant_name or biz.name_en
        merchant_city = biz.bakong_merchant_city or "Phnom Penh"
        acquiring_bank = biz.bakong_acquiring_bank

    if not account_id:
        # Provide clean developer/store-owner fallback
        account_id = f"merchant_{business_id.hex[:8]}@bkng"
        if not merchant_name:
            merchant_name = biz.name_en if biz else "Restaurant"

    return account_id, merchant_name or "Restaurant", merchant_city, acquiring_bank


async def generate_dynamic_session_khqr(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    currency: Literal["USD", "KHR"] = "USD",
    promo_code: str | None = None,
    manual_discount_type: DiscountType | None = None,
    manual_discount_value: Decimal | None = None,
    discount_reason: str | None = None,
    tenant: TenantContext | None = None,
) -> KHQRResponse:
    """
    Calculates dynamic table session bill and generates an official Bakong KHQR payload.
    """
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
        promo_code=promo_code,
        manual_discount_type=manual_discount_type,
        manual_discount_value=manual_discount_value,
        discount_reason=discount_reason,
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
    else:
        financials = bill.financials

    account_id, merchant_name, merchant_city, acquiring_bank = await _resolve_bakong_merchant_info(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
    )

    payable_amount = financials.grand_total_usd if currency == "USD" else Decimal(str(financials.grand_total_khr))
    bill_ref = f"SES-{table_session_id.hex[:8].upper()}"

    qr_str = build_khqr_payload(
        bakong_account_id=account_id,
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        acquiring_bank=acquiring_bank,
        amount=payable_amount,
        currency=currency,
        bill_number=bill_ref,
        terminal_label=f"T-{bill.table_number}" if bill.table_number else "POS",
        is_dynamic=True,
    )

    qr_image = generate_qr_image_data_url(qr_str)
    deep_link = f"bakong://qr?data={qr_str}"

    return KHQRResponse(
        qr_string=qr_str,
        qr_image_data_url=qr_image,
        currency=currency,
        amount=payable_amount,
        amount_usd=financials.grand_total_usd,
        amount_khr=financials.grand_total_khr,
        exchange_rate=financials.exchange_rate,
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        bakong_account_id=account_id,
        bill_reference=bill_ref,
        deep_link_url=deep_link,
    )


async def generate_dynamic_order_khqr(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    currency: Literal["USD", "KHR"] = "USD",
    promo_code: str | None = None,
    manual_discount_type: DiscountType | None = None,
    manual_discount_value: Decimal | None = None,
    discount_reason: str | None = None,
    tenant: TenantContext | None = None,
) -> KHQRResponse:
    """
    Calculates dynamic takeaway/single order bill and generates an official Bakong KHQR payload.
    """
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
        promo_code=promo_code,
        manual_discount_type=manual_discount_type,
        manual_discount_value=manual_discount_value,
        discount_reason=discount_reason,
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
    else:
        financials = bill.financials

    account_id, merchant_name, merchant_city, acquiring_bank = await _resolve_bakong_merchant_info(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
    )

    payable_amount = financials.grand_total_usd if currency == "USD" else Decimal(str(financials.grand_total_khr))
    bill_ref = f"ORD-{order_id.hex[:8].upper()}"

    qr_str = build_khqr_payload(
        bakong_account_id=account_id,
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        acquiring_bank=acquiring_bank,
        amount=payable_amount,
        currency=currency,
        bill_number=bill_ref,
        terminal_label="POS",
        is_dynamic=True,
    )

    qr_image = generate_qr_image_data_url(qr_str)
    deep_link = f"bakong://qr?data={qr_str}"

    return KHQRResponse(
        qr_string=qr_str,
        qr_image_data_url=qr_image,
        currency=currency,
        amount=payable_amount,
        amount_usd=financials.grand_total_usd,
        amount_khr=financials.grand_total_khr,
        exchange_rate=financials.exchange_rate,
        merchant_name=merchant_name,
        merchant_city=merchant_city,
        bakong_account_id=account_id,
        bill_reference=bill_ref,
        deep_link_url=deep_link,
    )
