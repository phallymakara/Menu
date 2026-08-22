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
from app.models.branch import Branch
from app.models.business import Business
from app.models.dining_area import DiningArea
from app.models.enums import OrderItemStatus, OrderStatus
from app.models.order import Order, OrderItem
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.schemas.billing import (
    BillConsolidatedItemSummary,
    BillFinancialBreakdown,
    BillItemModifierSummary,
    BillItemSummary,
    BillRoundSummary,
    BillSummaryResponse,
)

logger = structlog.get_logger("app.services.billing_service")


def _round_khr_to_hundred(amount: Decimal | float) -> int:
    """Rounds a KHR amount to the nearest 100 Riel (standard Cambodian retail convention)."""
    khr_val = float(amount)
    return int(round(khr_val / 100.0)) * 100


async def _resolve_financial_settings(
    session: AsyncSession,
    branch_id: UUID,
    table_id: UUID | None = None,
) -> tuple[Decimal, Decimal, Decimal, bool, bool]:
    """
    Resolves active tax rate, service charge rate (with dining area override if present),
    exchange rate, and inclusivity flags.
    Returns: (tax_pct, sc_pct, exchange_rate, is_tax_inclusive, is_sc_inclusive)
    """
    branch_res = await session.execute(select(Branch).where(Branch.id == branch_id))
    branch = branch_res.scalar_one_or_none()
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found.",
        )

    business_res = await session.execute(
        select(Business).where(Business.id == branch.business_id)
    )
    business = business_res.scalar_one_or_none()
    if business is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent business not found.",
        )

    # 1. Tax percentage & Inclusivity
    if branch.tax_percentage is not None:
        tax_pct = branch.tax_percentage
    elif business.tax_percentage is not None:
        tax_pct = business.tax_percentage
    else:
        tax_pct = Decimal("0.00")

    if branch.is_tax_inclusive is not None:
        is_tax_inc = branch.is_tax_inclusive
    else:
        is_tax_inc = business.is_tax_inclusive

    # 2. Service Charge percentage (Check Dining Area override first)
    sc_pct = None
    if table_id is not None:
        table_res = await session.execute(
            select(RestaurantTable).where(RestaurantTable.id == table_id)
        )
        table = table_res.scalar_one_or_none()
        if table and table.dining_area_id is not None:
            area_res = await session.execute(
                select(DiningArea).where(DiningArea.id == table.dining_area_id)
            )
            area = area_res.scalar_one_or_none()
            if area and area.service_charge_percentage is not None:
                sc_pct = area.service_charge_percentage

    if sc_pct is None:
        if branch.service_charge_percentage is not None:
            sc_pct = branch.service_charge_percentage
        elif business.service_charge_percentage is not None:
            sc_pct = business.service_charge_percentage
        else:
            sc_pct = Decimal("0.00")

    if branch.is_service_charge_inclusive is not None:
        is_sc_inc = branch.is_service_charge_inclusive
    else:
        is_sc_inc = business.is_service_charge_inclusive

    # 3. Exchange Rate (Branch override -> Business configuration -> 4100.00 default)
    if branch.exchange_rate is not None and branch.exchange_rate > Decimal("0.00"):
        exchange_rate = branch.exchange_rate
    elif business.exchange_rate is not None and business.exchange_rate > Decimal("0.00"):
        exchange_rate = business.exchange_rate
    else:
        exchange_rate = Decimal("4100.00")

    return tax_pct, sc_pct, exchange_rate, is_tax_inc, is_sc_inc


def calculate_financial_breakdown(
    subtotal_usd: Decimal,
    tax_pct: Decimal,
    sc_pct: Decimal,
    exchange_rate: Decimal,
    discount_usd: Decimal = Decimal("0.00"),
    is_tax_inclusive: bool = False,
    is_sc_inclusive: bool = False,
) -> BillFinancialBreakdown:
    """Calculates all line items and dual currency amounts in USD and KHR."""
    discounted_subtotal = max(Decimal("0.00"), subtotal_usd - discount_usd)

    if is_sc_inclusive and sc_pct > Decimal("0.00"):
        sc_amount_usd = (
            discounted_subtotal - (discounted_subtotal / (Decimal("1") + sc_pct / Decimal("100")))
        ).quantize(Decimal("0.01"))
    else:
        sc_amount_usd = (discounted_subtotal * (sc_pct / Decimal("100"))).quantize(
            Decimal("0.01")
        )

    if is_tax_inclusive and tax_pct > Decimal("0.00"):
        tax_amount_usd = (
            discounted_subtotal - (discounted_subtotal / (Decimal("1") + tax_pct / Decimal("100")))
        ).quantize(Decimal("0.01"))
    else:
        taxable_base = discounted_subtotal if is_sc_inclusive else (discounted_subtotal + sc_amount_usd)
        tax_amount_usd = (taxable_base * (tax_pct / Decimal("100"))).quantize(Decimal("0.01"))

    # If inclusive, grand total is the discounted subtotal. Otherwise, add components.
    if is_tax_inclusive and is_sc_inclusive:
        grand_total_usd = discounted_subtotal
    elif is_tax_inclusive and not is_sc_inclusive:
        grand_total_usd = discounted_subtotal + sc_amount_usd
    elif not is_tax_inclusive and is_sc_inclusive:
        grand_total_usd = discounted_subtotal + tax_amount_usd
    else:
        grand_total_usd = discounted_subtotal + sc_amount_usd + tax_amount_usd

    # Convert to KHR with 100 KHR rounding
    subtotal_khr = _round_khr_to_hundred(subtotal_usd * exchange_rate)
    sc_khr = _round_khr_to_hundred(sc_amount_usd * exchange_rate)
    tax_khr = _round_khr_to_hundred(tax_amount_usd * exchange_rate)
    grand_total_khr = _round_khr_to_hundred(grand_total_usd * exchange_rate)

    return BillFinancialBreakdown(
        subtotal_usd=subtotal_usd,
        discount_usd=discount_usd,
        discount_percent=None,
        taxable_amount_usd=discounted_subtotal,
        service_charge_percent=sc_pct,
        service_charge_amount_usd=sc_amount_usd,
        tax_percent=tax_pct,
        tax_amount_usd=tax_amount_usd,
        grand_total_usd=grand_total_usd,
        exchange_rate=exchange_rate,
        subtotal_khr=subtotal_khr,
        service_charge_amount_khr=sc_khr,
        tax_amount_khr=tax_khr,
        grand_total_khr=grand_total_khr,
    )


def _build_round_and_consolidated_summaries(
    orders: list[Order],
) -> tuple[list[BillRoundSummary], list[BillConsolidatedItemSummary], Decimal, int]:
    """
    Builds round summaries and consolidated item list.
    Excludes VOIDED items from the active bill subtotal and consolidations.
    """
    round_summaries: list[BillRoundSummary] = []
    consolidated_dict: dict[tuple[UUID, UUID | None, str], BillConsolidatedItemSummary] = {}
    total_valid_subtotal_usd = Decimal("0.00")
    total_item_count = 0

    for order in orders:
        round_items: list[BillItemSummary] = []
        round_subtotal_usd = Decimal("0.00")

        for item in order.items:
            mod_summaries = [
                BillItemModifierSummary(
                    id=m.id,
                    modifier_option_id=m.modifier_option_id,
                    name_en=m.name_en,
                    name_km=m.name_km,
                    unit_price=m.unit_price,
                    quantity=m.quantity,
                )
                for m in item.modifiers
            ]

            item_summary = BillItemSummary(
                id=item.id,
                menu_item_id=item.menu_item_id,
                item_variant_id=item.item_variant_id,
                item_name_en=item.item_name_en,
                item_name_km=item.item_name_km,
                variant_name_en=item.variant_name_en,
                variant_name_km=item.variant_name_km,
                base_unit_price=item.base_unit_price,
                unit_price=item.unit_price,
                quantity=item.quantity,
                subtotal_price=item.subtotal_price,
                course_stage=item.course_stage,
                status=item.status,
                void_reason=item.void_reason,
                special_instructions=item.special_instructions,
                modifiers=mod_summaries,
            )
            round_items.append(item_summary)

            # If item is NOT voided, contribute to active bill totals
            if item.status != OrderItemStatus.VOIDED:
                round_subtotal_usd += item.subtotal_price
                total_valid_subtotal_usd += item.subtotal_price
                total_item_count += item.quantity

                # Grouping key for consolidated view
                mod_names_sorted = sorted([m.name_en for m in item.modifiers])
                mod_key = "|".join(mod_names_sorted)
                group_key = (item.menu_item_id, item.item_variant_id, mod_key)

                if group_key not in consolidated_dict:
                    consolidated_dict[group_key] = BillConsolidatedItemSummary(
                        menu_item_id=item.menu_item_id,
                        item_variant_id=item.item_variant_id,
                        item_name_en=item.item_name_en,
                        item_name_km=item.item_name_km,
                        variant_name_en=item.variant_name_en,
                        variant_name_km=item.variant_name_km,
                        unit_price=item.unit_price,
                        total_quantity=item.quantity,
                        total_price=item.subtotal_price,
                        modifier_names=mod_names_sorted,
                    )
                else:
                    consolidated_dict[group_key].total_quantity += item.quantity
                    consolidated_dict[group_key].total_price += item.subtotal_price

        round_summaries.append(
            BillRoundSummary(
                order_id=order.id,
                order_number=order.order_number,
                round_number=order.round_number,
                status=order.status,
                order_source=order.order_source,
                placed_at=order.created_at,
                round_subtotal_usd=round_subtotal_usd,
                items=round_items,
            )
        )

    return (
        round_summaries,
        list(consolidated_dict.values()),
        total_valid_subtotal_usd,
        total_item_count,
    )


async def get_table_session_bill_summary(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    table_session_id: UUID,
    tenant: TenantContext | None = None,
) -> BillSummaryResponse:
    """
    Aggregates all order rounds for an active or completed table session
    and produces the consolidated bill summary in USD & KHR.
    """
    # 1. Fetch Table Session
    sess_query = (
        select(TableSession)
        .options(
            selectinload(TableSession.table).selectinload(RestaurantTable.dining_area)
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
            detail="Table dining session not found.",
        )

    # 2. Fetch all orders for this session (excluding CANCELLED / REJECTED)
    orders_res = await session.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
        )
        .where(
            Order.table_session_id == table_session_id,
            Order.status != OrderStatus.CANCELLED,
        )
        .order_by(Order.round_number.asc(), Order.created_at.asc())
    )
    orders = list(orders_res.scalars().all())

    # 3. Calculate Item Breakdown & Consolidations
    rounds, consolidated, subtotal_usd, total_items = _build_round_and_consolidated_summaries(orders)

    # 4. Resolve Financial Settings & Calculate Totals
    table = table_sess.table
    tax_pct, sc_pct, exchange_rate, is_tax_inc, is_sc_inc = await _resolve_financial_settings(
        session=session,
        branch_id=branch_id,
        table_id=table_sess.table_id,
    )

    financials = calculate_financial_breakdown(
        subtotal_usd=subtotal_usd,
        tax_pct=tax_pct,
        sc_pct=sc_pct,
        exchange_rate=exchange_rate,
        is_tax_inclusive=is_tax_inc,
        is_sc_inclusive=is_sc_inc,
    )

    # 5. Calculate Elapsed Duration
    now_utc = datetime.now(timezone.utc)
    opened = (
        table_sess.opened_at
        if table_sess.opened_at.tzinfo
        else table_sess.opened_at.replace(tzinfo=timezone.utc)
    )
    closed = (
        table_sess.closed_at
        if table_sess.closed_at and table_sess.closed_at.tzinfo
        else table_sess.closed_at.replace(tzinfo=timezone.utc)
        if table_sess.closed_at
        else now_utc
    )
    duration_mins = max(0, int((closed - opened).total_seconds() // 60))

    table_name = f"Table {table.table_number}" if table else None
    dining_area_name = table.dining_area.name_en if table and table.dining_area else None

    return BillSummaryResponse(
        table_session_id=table_sess.id,
        table_id=table_sess.table_id,
        table_number=table.table_number if table else None,
        table_display_name=table_name,
        dining_area_name=dining_area_name,
        guest_count=table_sess.guest_count,
        session_code=table_sess.session_code,
        session_status=table_sess.status,  # type: ignore[arg-type]
        opened_at=table_sess.opened_at,
        dining_duration_minutes=duration_mins,
        order_count=len(orders),
        total_item_count=total_items,
        rounds=rounds,
        consolidated_items=consolidated,
        financials=financials,
    )


async def get_order_bill_summary(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    tenant: TenantContext | None = None,
) -> BillSummaryResponse:
    """
    Produces the bill summary for a single standalone order (e.g. takeaway or direct POS order).
    """
    order_query = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.modifiers),
            selectinload(Order.table).selectinload(RestaurantTable.dining_area),
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

    rounds, consolidated, subtotal_usd, total_items = _build_round_and_consolidated_summaries([order])

    tax_pct, sc_pct, exchange_rate, is_tax_inc, is_sc_inc = await _resolve_financial_settings(
        session=session,
        branch_id=branch_id,
        table_id=order.table_id,
    )

    financials = calculate_financial_breakdown(
        subtotal_usd=subtotal_usd,
        tax_pct=tax_pct,
        sc_pct=sc_pct,
        exchange_rate=exchange_rate,
        is_tax_inclusive=is_tax_inc,
        is_sc_inclusive=is_sc_inc,
    )

    table = order.table
    dining_area_name = table.dining_area.name_en if table and table.dining_area else None

    return BillSummaryResponse(
        table_session_id=order.table_session_id,
        table_id=order.table_id,
        table_number=table.table_number if table else None,
        table_display_name=f"Table {table.table_number}" if table else None,
        dining_area_name=dining_area_name,
        guest_count=None,
        session_code=None,
        session_status=None,
        opened_at=order.created_at,
        dining_duration_minutes=0,
        order_count=1,
        total_item_count=total_items,
        rounds=rounds,
        consolidated_items=consolidated,
        financials=financials,
    )


async def get_public_session_bill_summary(
    session: AsyncSession,
    session_token: str,
) -> BillSummaryResponse:
    """
    Public guest endpoint: retrieves the live running bill summary using the guest's session token.
    """
    sess_res = await session.execute(
        select(TableSession)
        .options(
            selectinload(TableSession.table).selectinload(RestaurantTable.dining_area)
        )
        .where(TableSession.session_token == session_token)
    )
    table_sess = sess_res.scalar_one_or_none()
    if table_sess is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired table session token.",
        )

    return await get_table_session_bill_summary(
        session=session,
        business_id=table_sess.business_id,
        branch_id=table_sess.branch_id,
        table_session_id=table_sess.id,
    )
