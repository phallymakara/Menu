from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.business import Business
from app.models.order import Order, OrderItem
from app.models.payment import Payment
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.models.user import User
from app.schemas.receipt import ReceiptData, ReceiptFinancials, ReceiptItem
from app.services.billing_service import (
    get_order_bill_summary,
    get_table_session_bill_summary,
)

logger = structlog.get_logger("app.services.receipt_service")


def _get_localized_label(en_text: str, km_text: str, lang: str) -> str:
    if lang == "km":
        return km_text
    elif lang == "en":
        return en_text
    else:  # bilingual
        return f"{km_text} / {en_text}"


async def build_payment_receipt_data(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    payment_id: UUID,
    tenant: TenantContext | None = None,
) -> ReceiptData:
    """Builds normalized ReceiptData for a completed Payment record."""
    query = (
        select(Payment)
        .options(
            selectinload(Payment.business),
            selectinload(Payment.branch),
            selectinload(Payment.received_by),
            selectinload(Payment.table_session).selectinload(TableSession.table).selectinload(RestaurantTable.dining_area),
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

    business = payment.business
    branch = payment.branch
    cashier = payment.received_by.full_name if payment.received_by else "Staff"

    table_number = None
    dining_area_name = None
    guest_count = None

    if payment.table_session:
        table_sess = payment.table_session
        guest_count = table_sess.guest_count
        if table_sess.table:
            table_number = table_sess.table.table_number
            if table_sess.table.dining_area:
                dining_area_name = table_sess.table.dining_area.name_en
        bill_summary = await get_table_session_bill_summary(
            session=session,
            business_id=business_id,
            branch_id=branch_id,
            table_session_id=payment.table_session_id,  # pyright: ignore[reportArgumentType]
            tenant=tenant,
        )
        raw_items = bill_summary.consolidated_items
        items = [
            ReceiptItem(
                item_name_en=item.item_name_en,
                item_name_km=item.item_name_km,
                variant_name_en=item.variant_name_en,
                variant_name_km=item.variant_name_km,
                modifier_names_en=item.modifier_names,
                quantity=item.total_quantity,
                unit_price_usd=item.unit_price,
                total_price_usd=item.total_price,
            )
            for item in raw_items
        ]
        subtotal = bill_summary.financials.subtotal_usd
        discount = bill_summary.financials.discount_usd
        sc_pct = bill_summary.financials.service_charge_percent
        sc_amt = bill_summary.financials.service_charge_amount_usd
        tax_pct = bill_summary.financials.tax_percent
        tax_amt = bill_summary.financials.tax_amount_usd
    elif payment.order_id:
        bill_summary = await get_order_bill_summary(
            session=session,
            business_id=business_id,
            branch_id=branch_id,
            order_id=payment.order_id,
            tenant=tenant,
        )
        raw_items = bill_summary.consolidated_items
        items = [
            ReceiptItem(
                item_name_en=item.item_name_en,
                item_name_km=item.item_name_km,
                variant_name_en=item.variant_name_en,
                variant_name_km=item.variant_name_km,
                modifier_names_en=item.modifier_names,
                quantity=item.total_quantity,
                unit_price_usd=item.unit_price,
                total_price_usd=item.total_price,
            )
            for item in raw_items
        ]
        subtotal = bill_summary.financials.subtotal_usd
        discount = bill_summary.financials.discount_usd
        sc_pct = bill_summary.financials.service_charge_percent
        sc_amt = bill_summary.financials.service_charge_amount_usd
        tax_pct = bill_summary.financials.tax_percent
        tax_amt = bill_summary.financials.tax_amount_usd
    else:
        items = []
        subtotal = payment.bill_subtotal_usd
        discount = payment.discount_usd
        sc_pct = Decimal("0.00")
        sc_amt = payment.service_charge_usd
        tax_pct = Decimal("0.00")
        tax_amt = payment.tax_usd

    financials = ReceiptFinancials(
        subtotal_usd=subtotal,
        discount_usd=discount,
        service_charge_percent=sc_pct,
        service_charge_amount_usd=sc_amt,
        tax_percent=tax_pct,
        tax_amount_usd=tax_amt,
        grand_total_usd=payment.grand_total_usd,
        exchange_rate=payment.exchange_rate,
        grand_total_khr=payment.grand_total_khr,
        amount_tendered_usd=payment.amount_tendered_usd,
        amount_tendered_khr=payment.amount_tendered_khr,
        total_tendered_usd=payment.total_tendered_usd,
        change_usd=payment.change_usd,
        change_khr=payment.change_khr,
    )

    return ReceiptData(
        receipt_type="OFFICIAL_RECEIPT",
        receipt_number=payment.payment_number,
        business_name_en=business.name_en,
        business_name_km=business.name_km,
        branch_name_en=branch.name_en,
        branch_name_km=branch.name_km,
        branch_code=branch.code,
        branch_address=branch.address,
        branch_phone=branch.phone,
        table_number=table_number,
        dining_area_name=dining_area_name,
        guest_count=guest_count,
        cashier_name=cashier,
        issued_at=payment.settled_at,
        payment_method=payment.payment_method.value.upper(),
        items=items,
        financials=financials,
        notes=payment.notes,
    )


async def build_session_precheck_receipt_data(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    current_user: User | None = None,
    tenant: TenantContext | None = None,
) -> ReceiptData:
    """Builds pro-forma pre-check ReceiptData for an active TableSession."""
    sess_query = (
        select(TableSession)
        .options(
            selectinload(TableSession.table).selectinload(RestaurantTable.dining_area),
            selectinload(TableSession.business),
            selectinload(TableSession.branch),
        )
        .where(
            TableSession.id == table_session_id,
            TableSession.business_id == business_id,
            TableSession.branch_id == branch_id,
        )
    )
    if tenant:
        sess_query = sess_query.where(TableSession.organization_id == tenant.organization_id)

    sess_res = await session.execute(sess_query)
    table_sess = sess_res.scalar_one_or_none()
    if table_sess is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table session not found.",
        )

    bill = await get_table_session_bill_summary(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=table_session_id,
        tenant=tenant,
    )

    business = table_sess.business
    branch = table_sess.branch
    table = table_sess.table
    dining_area_name = table.dining_area.name_en if table and table.dining_area else None

    items = [
        ReceiptItem(
            item_name_en=item.item_name_en,
            item_name_km=item.item_name_km,
            variant_name_en=item.variant_name_en,
            variant_name_km=item.variant_name_km,
            modifier_names_en=item.modifier_names,
            quantity=item.total_quantity,
            unit_price_usd=item.unit_price,
            total_price_usd=item.total_price,
        )
        for item in bill.consolidated_items
    ]

    financials = ReceiptFinancials(
        subtotal_usd=bill.financials.subtotal_usd,
        discount_usd=bill.financials.discount_usd,
        service_charge_percent=bill.financials.service_charge_percent,
        service_charge_amount_usd=bill.financials.service_charge_amount_usd,
        tax_percent=bill.financials.tax_percent,
        tax_amount_usd=bill.financials.tax_amount_usd,
        grand_total_usd=bill.financials.grand_total_usd,
        exchange_rate=bill.financials.exchange_rate,
        grand_total_khr=bill.financials.grand_total_khr,
    )

    now_utc = datetime.now(timezone.utc)
    return ReceiptData(
        receipt_type="PRE_CHECK_BILL",
        receipt_number=f"CHK-{table_sess.session_code}",
        business_name_en=business.name_en,
        business_name_km=business.name_km,
        branch_name_en=branch.name_en,
        branch_name_km=branch.name_km,
        branch_code=branch.code,
        branch_address=branch.address,
        branch_phone=branch.phone,
        table_number=table.table_number if table else None,
        dining_area_name=dining_area_name,
        guest_count=table_sess.guest_count,
        cashier_name=current_user.full_name if current_user else "Server",
        issued_at=now_utc,
        payment_method=None,
        items=items,
        financials=financials,
        notes="Please verify items before payment",
    )


async def build_order_precheck_receipt_data(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    current_user: User | None = None,
    tenant: TenantContext | None = None,
) -> ReceiptData:
    """Builds pro-forma pre-check ReceiptData for a standalone Order."""
    order_query = (
        select(Order)
        .options(
            selectinload(Order.business),
            selectinload(Order.branch),
            selectinload(Order.table),
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

    bill = await get_order_bill_summary(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        tenant=tenant,
    )

    business = order.business
    branch = order.branch
    table = order.table

    items = [
        ReceiptItem(
            item_name_en=item.item_name_en,
            item_name_km=item.item_name_km,
            variant_name_en=item.variant_name_en,
            variant_name_km=item.variant_name_km,
            modifier_names_en=item.modifier_names,
            quantity=item.total_quantity,
            unit_price_usd=item.unit_price,
            total_price_usd=item.total_price,
        )
        for item in bill.consolidated_items
    ]

    financials = ReceiptFinancials(
        subtotal_usd=bill.financials.subtotal_usd,
        discount_usd=bill.financials.discount_usd,
        service_charge_percent=bill.financials.service_charge_percent,
        service_charge_amount_usd=bill.financials.service_charge_amount_usd,
        tax_percent=bill.financials.tax_percent,
        tax_amount_usd=bill.financials.tax_amount_usd,
        grand_total_usd=bill.financials.grand_total_usd,
        exchange_rate=bill.financials.exchange_rate,
        grand_total_khr=bill.financials.grand_total_khr,
    )

    now_utc = datetime.now(timezone.utc)
    return ReceiptData(
        receipt_type="PRE_CHECK_BILL",
        receipt_number=f"CHK-{order.order_number}",
        business_name_en=business.name_en,
        business_name_km=business.name_km,
        branch_name_en=branch.name_en,
        branch_name_km=branch.name_km,
        branch_code=branch.code,
        branch_address=branch.address,
        branch_phone=branch.phone,
        table_number=table.table_number if table else None,
        dining_area_name=None,
        guest_count=None,
        cashier_name=current_user.full_name if current_user else "Server",
        issued_at=now_utc,
        payment_method=None,
        items=items,
        financials=financials,
        notes="Takeaway Pre-Check",
    )


# ---------------------------------------------------------------------------
# HTML & Monospace Text Receipt Renderers
# ---------------------------------------------------------------------------

def render_html_receipt(
    receipt: ReceiptData,
    width: Literal["80mm", "58mm"] = "80mm",
    lang: Literal["km", "en", "bilingual"] = "bilingual",
) -> str:
    """Renders pixel-perfect HTML/CSS receipt optimized for thermal & browser printing."""
    max_w = "72mm" if width == "80mm" else "52mm"
    font_size = "13px" if width == "80mm" else "11px"

    # Header labels
    if receipt.receipt_type == "OFFICIAL_RECEIPT":
        title = _get_localized_label("OFFICIAL RECEIPT", "វិក្កយបត្រផ្លូវការ", lang)
    else:
        title = _get_localized_label("PRE-CHECK BILL", "វិក្កយបត្របណ្តោះអាសន្ន", lang)

    biz_name = (
        receipt.business_name_km
        if lang == "km" and receipt.business_name_km
        else receipt.business_name_en
    )
    if lang == "bilingual" and receipt.business_name_km:
        biz_name = f"{receipt.business_name_km}<br><span style='font-size: 0.9em;'>{receipt.business_name_en}</span>"

    branch_name = (
        receipt.branch_name_km
        if lang == "km" and receipt.branch_name_km
        else receipt.branch_name_en
    )

    lbl_receipt_no = _get_localized_label("Receipt #", "លេខវិក្កយបត្រ", lang)
    lbl_date = _get_localized_label("Date", "កាលបរិច្ឆេទ", lang)
    lbl_table = _get_localized_label("Table", "តុ", lang)
    lbl_cashier = _get_localized_label("Cashier", "បេឡា", lang)
    lbl_item = _get_localized_label("Item", "ទំនិញ", lang)
    lbl_qty = _get_localized_label("Qty", "ចំនួន", lang)
    lbl_total = _get_localized_label("Total", "សរុប", lang)
    lbl_subtotal = _get_localized_label("Subtotal", "សរុបរង", lang)
    lbl_sc = _get_localized_label("Service Charge", "សេវាកម្ម", lang)
    lbl_tax = _get_localized_label("VAT / Tax", "ពន្ធអាករ", lang)
    lbl_grand_usd = _get_localized_label("Grand Total (USD)", "សរុបរួម (USD)", lang)
    lbl_rate = _get_localized_label("Exchange Rate", "អត្រាប្តូរប្រាក់", lang)
    lbl_grand_khr = _get_localized_label("Grand Total (KHR)", "សរុបរួម (រៀល)", lang)
    lbl_tendered = _get_localized_label("Cash Tendered", "ប្រាក់ទទួលបាន", lang)
    lbl_change = _get_localized_label("Change", "ប្រាក់អាប់", lang)
    lbl_thankyou = _get_localized_label(
        "Thank you for dining with us!",
        "សូមអរគុណ និងសូមអញ្ជើញមកម្តងទៀត!",
        lang,
    )

    items_html = ""
    for itm in receipt.items:
        itm_display = itm.item_name_km if lang == "km" and itm.item_name_km else itm.item_name_en
        if lang == "bilingual" and itm.item_name_km:
            itm_display = f"<strong>{itm.item_name_en}</strong><div style='font-size: 0.85em; color: #444;'>{itm.item_name_km}</div>"

        mods_display = ""
        if itm.modifier_names_en:
            mods_display = f"<div style='font-size: 0.8em; color: #666; padding-left: 8px;'>+ {', '.join(itm.modifier_names_en)}</div>"

        items_html += f"""
        <tr>
            <td style="vertical-align: top; padding: 4px 0;">{itm_display}{mods_display}</td>
            <td style="text-align: center; vertical-align: top; padding: 4px 0;">{itm.quantity}</td>
            <td style="text-align: right; vertical-align: top; padding: 4px 0;">${itm.unit_price_usd:.2f}</td>
            <td style="text-align: right; vertical-align: top; padding: 4px 0;">${itm.total_price_usd:.2f}</td>
        </tr>
        """

    # Optional Payment details
    payment_section = ""
    if receipt.receipt_type == "OFFICIAL_RECEIPT" and receipt.financials.amount_tendered_usd is not None:
        tendered_usd_val = receipt.financials.amount_tendered_usd or Decimal("0.00")
        tendered_khr_val = receipt.financials.amount_tendered_khr or 0
        change_usd_val = receipt.financials.change_usd or Decimal("0.00")
        change_khr_val = receipt.financials.change_khr or 0

        payment_section = f"""
        <div style="border-top: 1px dashed #000; margin-top: 6px; padding-top: 6px;">
            <div style="display: flex; justify-content: space-between;">
                <span>{lbl_tendered}:</span>
                <span>${tendered_usd_val:.2f} + {tendered_khr_val:,} KHR</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
                <span>{lbl_change}:</span>
                <span>${change_usd_val:.2f} / {change_khr_val:,} KHR</span>
            </div>
        </div>
        """

    table_line = ""
    if receipt.table_number:
        area_txt = f" ({receipt.dining_area_name})" if receipt.dining_area_name else ""
        table_line = f"""
        <div style="display: flex; justify-content: space-between;">
            <span>{lbl_table}:</span>
            <span><strong>{receipt.table_number}</strong>{area_txt}</span>
        </div>
        """

    dt_str = receipt.issued_at.strftime("%Y-%m-%d %H:%M")

    return f"""<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt - {receipt.receipt_number}</title>
    <style>
        @page {{
            size: {width} auto;
            margin: 0mm;
        }}
        @media print {{
            body {{
                margin: 0;
                padding: 4mm;
            }}
            .no-print {{
                display: none;
            }}
        }}
        body {{
            font-family: 'Kantumruy Pro', 'Noto Sans Khmer', 'Segoe UI', Tahoma, monospace, sans-serif;
            font-size: {font_size};
            line-height: 1.35;
            color: #000;
            background: #fff;
            margin: 0 auto;
            padding: 4mm;
            max-width: {max_w};
        }}
        .text-center {{ text-align: center; }}
        .text-right {{ text-align: right; }}
        .bold {{ font-weight: bold; }}
        .divider {{ border-top: 1px dashed #000; margin: 6px 0; }}
        .double-divider {{ border-top: 2px solid #000; margin: 6px 0; }}
        table {{ width: 100%; border-collapse: collapse; }}
    </style>
</head>
<body>
    <div class="text-center">
        <h2 style="margin: 0 0 2px 0; font-size: 1.25em;">{biz_name}</h2>
        <div style="font-size: 0.9em;">{branch_name}</div>
        {f"<div style='font-size: 0.85em;'>{receipt.branch_address}</div>" if receipt.branch_address else ""}
        {f"<div style='font-size: 0.85em;'>Tel: {receipt.branch_phone}</div>" if receipt.branch_phone else ""}
        <div class="divider"></div>
        <div class="bold" style="font-size: 1.05em; text-transform: uppercase;">{title}</div>
        <div class="divider"></div>
    </div>

    <div style="font-size: 0.9em;">
        <div style="display: flex; justify-content: space-between;">
            <span>{lbl_receipt_no}:</span>
            <span><strong>{receipt.receipt_number}</strong></span>
        </div>
        <div style="display: flex; justify-content: space-between;">
            <span>{lbl_date}:</span>
            <span>{dt_str}</span>
        </div>
        {table_line}
        <div style="display: flex; justify-content: space-between;">
            <span>{lbl_cashier}:</span>
            <span>{receipt.cashier_name}</span>
        </div>
    </div>

    <div class="divider"></div>

    <table>
        <thead>
            <tr style="border-bottom: 1px solid #000; font-size: 0.85em;">
                <th style="text-align: left; padding-bottom: 4px;">{lbl_item}</th>
                <th style="text-align: center; width: 30px; padding-bottom: 4px;">{lbl_qty}</th>
                <th style="text-align: right; width: 50px; padding-bottom: 4px;">Price</th>
                <th style="text-align: right; width: 55px; padding-bottom: 4px;">{lbl_total}</th>
            </tr>
        </thead>
        <tbody>
            {items_html}
        </tbody>
    </table>

    <div class="divider"></div>

    <div style="font-size: 0.95em;">
        <div style="display: flex; justify-content: space-between;">
            <span>{lbl_subtotal}:</span>
            <span>${receipt.financials.subtotal_usd:.2f}</span>
        </div>
        {f"<div style='display: flex; justify-content: space-between;'><span>{lbl_sc} ({receipt.financials.service_charge_percent:.0f}%):</span><span>${receipt.financials.service_charge_amount_usd:.2f}</span></div>" if receipt.financials.service_charge_amount_usd > 0 else ""}
        {f"<div style='display: flex; justify-content: space-between;'><span>{lbl_tax} ({receipt.financials.tax_percent:.0f}%):</span><span>${receipt.financials.tax_amount_usd:.2f}</span></div>" if receipt.financials.tax_amount_usd > 0 else ""}
    </div>

    <div class="double-divider"></div>

    <div style="font-size: 1.1em; font-weight: bold;">
        <div style="display: flex; justify-content: space-between;">
            <span>{lbl_grand_usd}:</span>
            <span>${receipt.financials.grand_total_usd:.2f}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: #222;">
            <span>{lbl_rate}:</span>
            <span>1 USD = {receipt.financials.exchange_rate:,.0f} KHR</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            <span>{lbl_grand_khr}:</span>
            <span>{receipt.financials.grand_total_khr:,} KHR</span>
        </div>
    </div>

    {payment_section}

    <div class="divider"></div>

    <div class="text-center" style="font-size: 0.85em; margin-top: 10px;">
        <div>{lbl_thankyou}</div>
    </div>
</body>
</html>
"""


def render_text_receipt(
    receipt: ReceiptData,
    width_cols: int = 42,
    lang: Literal["km", "en", "bilingual"] = "bilingual",
) -> str:
    """Renders standard monospace aligned ASCII/Unicode text for ESC/POS hardware printers."""
    lines = []
    dash_line = "-" * width_cols
    double_line = "=" * width_cols

    def center(txt: str) -> str:
        return txt.center(width_cols)

    def row(left: str, right: str) -> str:
        space = width_cols - len(left) - len(right)
        if space < 1:
            return f"{left}\n{right.rjust(width_cols)}"
        return left + (" " * space) + right

    # Header
    biz_name = receipt.business_name_en
    if lang == "km" and receipt.business_name_km:
        biz_name = receipt.business_name_km
    lines.append(center(biz_name))
    lines.append(center(receipt.branch_name_en))
    if receipt.branch_phone:
        lines.append(center(f"Tel: {receipt.branch_phone}"))
    lines.append(dash_line)

    title = "OFFICIAL RECEIPT" if receipt.receipt_type == "OFFICIAL_RECEIPT" else "PRE-CHECK BILL"
    if lang == "km":
        title = "វិក្កយបត្រផ្លូវការ" if receipt.receipt_type == "OFFICIAL_RECEIPT" else "វិក្កយបត្របណ្តោះអាសន្ន"
    lines.append(center(title))
    lines.append(dash_line)

    lines.append(row("Receipt #:", receipt.receipt_number))
    lines.append(row("Date:", receipt.issued_at.strftime("%Y-%m-%d %H:%M")))
    if receipt.table_number:
        lines.append(row("Table:", receipt.table_number))
    lines.append(row("Cashier:", receipt.cashier_name or "Staff"))
    lines.append(dash_line)

    # Table Header
    lines.append(row("Item", "Qty   Total"))
    lines.append(dash_line)

    for item in receipt.items:
        name = item.item_name_km if lang == "km" and item.item_name_km else item.item_name_en
        right_str = f"{item.quantity:>3} ${item.total_price_usd:>6.2f}"
        lines.append(row(name, right_str))
        if item.modifier_names_en:
            lines.append(f"  + {', '.join(item.modifier_names_en)}")

    lines.append(dash_line)
    lines.append(row("Subtotal:", f"${receipt.financials.subtotal_usd:.2f}"))
    if receipt.financials.service_charge_amount_usd > 0:
        lines.append(row(f"Service Charge ({receipt.financials.service_charge_percent:.0f}%):", f"${receipt.financials.service_charge_amount_usd:.2f}"))
    if receipt.financials.tax_amount_usd > 0:
        lines.append(row(f"VAT / Tax ({receipt.financials.tax_percent:.0f}%):", f"${receipt.financials.tax_amount_usd:.2f}"))

    lines.append(double_line)
    lines.append(row("GRAND TOTAL (USD):", f"${receipt.financials.grand_total_usd:.2f}"))
    lines.append(row("Exchange Rate:", f"1$ = {receipt.financials.exchange_rate:,.0f} KHR"))
    lines.append(row("GRAND TOTAL (KHR):", f"{receipt.financials.grand_total_khr:,} KHR"))

    if receipt.receipt_type == "OFFICIAL_RECEIPT" and receipt.financials.amount_tendered_usd is not None:
        lines.append(dash_line)
        lines.append(row("Tendered USD:", f"${receipt.financials.amount_tendered_usd:.2f}"))
        lines.append(row("Tendered KHR:", f"{receipt.financials.amount_tendered_khr:,} KHR"))
        lines.append(row("Change USD:", f"${receipt.financials.change_usd:.2f}"))
        lines.append(row("Change KHR:", f"{receipt.financials.change_khr:,} KHR"))

    lines.append(dash_line)
    lines.append(center("Thank you! / សូមអរគុណ!"))
    lines.append("\n")

    return "\n".join(lines)
