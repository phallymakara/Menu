from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.business import Business
from app.models.category import Category
from app.models.enums import OrderStatus, PaymentMethod, PaymentStatus, TableSessionStatus
from app.models.menu_item import MenuItem
from app.models.order import Order, OrderItem
from app.models.payment import Payment
from app.models.table_session import TableSession
from app.schemas.analytics import (
    BranchComparisonItem,
    BranchComparisonResponse,
    PaymentBreakdownResponse,
    PaymentMethodMetric,
    SalesOverviewMetrics,
    TopSellingItemDetail,
    TopSellingItemsResponse,
)
from app.services.billing_service import _round_khr_to_hundred
from app.services.branch_roaming_service import can_user_roam_branches

logger = structlog.get_logger("app.services.analytics_service")


def _resolve_analytics_branch_filter(
    tenant: TenantContext,
    requested_branch_id: UUID | None,
) -> UUID | None:
    """
    Validates branch access permissions for analytics:
    - Owners & General Managers: can view all branches (branch_id=None) or filter by any branch.
    - Branch Managers & Staff: restricted strictly to their assigned branch.
    """
    membership = tenant.membership
    can_roam = can_user_roam_branches(membership)

    if can_roam:
        return requested_branch_id

    # User is locked to their assigned branch
    if requested_branch_id is not None and requested_branch_id != membership.branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only view analytics for your assigned branch.",
        )
    return membership.branch_id


async def get_sales_overview(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    requested_branch_id: UUID | None = None,
) -> SalesOverviewMetrics:
    """
    Calculates consolidated financial and operational metrics.
    """
    effective_branch_id = _resolve_analytics_branch_filter(tenant, requested_branch_id)

    # 1. Fetch business financial configuration
    biz_res = await session.execute(
        select(Business).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    business = biz_res.scalar_one_or_none()
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")

    exchange_rate = business.exchange_rate or Decimal("4100.00")
    branch_name = None

    if effective_branch_id:
        br_res = await session.execute(
            select(Branch).where(
                Branch.id == effective_branch_id,
                Branch.business_id == business_id,
            )
        )
        br = br_res.scalar_one_or_none()
        if br:
            branch_name = br.name_en
            if br.exchange_rate:
                exchange_rate = br.exchange_rate

    # 2. Build Order aggregation query
    completed_statuses = [
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_TO_SERVE,
        OrderStatus.SERVED,
    ]
    query = (
        select(
            func.coalesce(func.sum(Order.subtotal_usd), Decimal("0.00")).label("gross_sales"),
            func.coalesce(func.sum(Order.tax_amount_usd), Decimal("0.00")).label("tax"),
            func.coalesce(func.sum(Order.service_charge_amount_usd), Decimal("0.00")).label("service_charge"),
            func.coalesce(func.sum(Order.total_amount_usd), Decimal("0.00")).label("net_revenue"),
            func.count(Order.id).label("order_count"),
        )
        .where(
            Order.business_id == business_id,
            Order.organization_id == tenant.organization_id,
            Order.status.in_(completed_statuses),
        )
    )

    if effective_branch_id:
        query = query.where(Order.branch_id == effective_branch_id)
    if start_date:
        query = query.where(Order.created_at >= start_date)
    if end_date:
        query = query.where(Order.created_at <= end_date)

    res = await session.execute(query)
    row = res.one()

    gross_sales = Decimal(str(row.gross_sales))
    tax = Decimal(str(row.tax))
    service_charge = Decimal(str(row.service_charge))
    net_revenue_usd = Decimal(str(row.net_revenue))
    order_count = int(row.order_count)

    # Calculate discounts from payments if available
    pay_disc_query = (
        select(func.coalesce(func.sum(Payment.discount_usd), Decimal("0.00")))
        .where(
            Payment.business_id == business_id,
            Payment.organization_id == tenant.organization_id,
            Payment.payment_status == PaymentStatus.COMPLETED,
        )
    )
    if effective_branch_id:
        pay_disc_query = pay_disc_query.where(Payment.branch_id == effective_branch_id)
    if start_date:
        pay_disc_query = pay_disc_query.where(Payment.created_at >= start_date)
    if end_date:
        pay_disc_query = pay_disc_query.where(Payment.created_at <= end_date)

    pay_disc_res = await session.execute(pay_disc_query)
    discounts = Decimal(str(pay_disc_res.scalar_one() or "0.00"))


    # 3. Session aggregation
    session_query = select(func.count(TableSession.id)).where(
        TableSession.business_id == business_id,
        TableSession.organization_id == tenant.organization_id,
        TableSession.status == TableSessionStatus.COMPLETED,
    )
    if effective_branch_id:
        session_query = session_query.where(TableSession.branch_id == effective_branch_id)
    if start_date:
        session_query = session_query.where(TableSession.created_at >= start_date)
    if end_date:
        session_query = session_query.where(TableSession.created_at <= end_date)

    session_res = await session.execute(session_query)
    closed_sessions = int(session_res.scalar_one() or 0)

    # 4. Compute AOV & KHR conversions
    aov = (net_revenue_usd / Decimal(order_count)).quantize(Decimal("0.01")) if order_count > 0 else Decimal("0.00")
    session_spend = (
        (net_revenue_usd / Decimal(closed_sessions)).quantize(Decimal("0.01"))
        if closed_sessions > 0
        else Decimal("0.00")
    )
    net_khr = Decimal(_round_khr_to_hundred(net_revenue_usd * exchange_rate))


    return SalesOverviewMetrics(
        business_id=business_id,
        branch_id=effective_branch_id,
        branch_name=branch_name,
        start_date=start_date,
        end_date=end_date,
        total_gross_sales_usd=gross_sales,
        total_discounts_usd=discounts,
        total_tax_usd=tax,
        total_service_charge_usd=service_charge,
        total_net_revenue_usd=net_revenue_usd,
        total_net_revenue_khr=net_khr,
        exchange_rate=exchange_rate,
        total_completed_orders=order_count,
        total_closed_sessions=closed_sessions,
        average_order_value_usd=aov,
        average_session_spend_usd=session_spend,
    )


async def get_branch_comparison(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> BranchComparisonResponse:
    """
    Generates multi-branch ranking matrix.
    Restricted to Brand Owners and General Managers.
    """
    if not can_user_roam_branches(tenant.membership):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Only Brand Owners and General Managers can view multi-branch comparison.",
        )

    # Fetch business
    biz_res = await session.execute(
        select(Business).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    business = biz_res.scalar_one_or_none()
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")

    base_rate = business.exchange_rate or Decimal("4100.00")

    # Fetch all active branches
    branches_res = await session.execute(
        select(Branch)
        .where(
            Branch.business_id == business_id,
            Branch.organization_id == tenant.organization_id,
            Branch.is_active.is_(True),
        )
        .order_by(Branch.name_en.asc())
    )
    branches = branches_res.scalars().all()

    # Aggregate orders per branch
    completed_statuses = [
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_TO_SERVE,
        OrderStatus.SERVED,
    ]
    order_query = (
        select(
            Order.branch_id,
            func.coalesce(func.sum(Order.total_amount_usd), Decimal("0.00")).label("net_rev"),
            func.count(Order.id).label("order_cnt"),
        )
        .where(
            Order.business_id == business_id,
            Order.organization_id == tenant.organization_id,
            Order.status.in_(completed_statuses),
        )
        .group_by(Order.branch_id)
    )
    if start_date:
        order_query = order_query.where(Order.created_at >= start_date)
    if end_date:
        order_query = order_query.where(Order.created_at <= end_date)

    order_res = await session.execute(order_query)
    branch_order_data = {
        row.branch_id: (Decimal(str(row.net_rev)), int(row.order_cnt))
        for row in order_res.all()
    }

    # Aggregate closed sessions per branch
    session_query = (
        select(
            TableSession.branch_id,
            func.count(TableSession.id).label("session_cnt"),
        )
        .where(
            TableSession.business_id == business_id,
            TableSession.organization_id == tenant.organization_id,
            TableSession.status == TableSessionStatus.COMPLETED,
        )
        .group_by(TableSession.branch_id)
    )
    if start_date:
        session_query = session_query.where(TableSession.created_at >= start_date)
    if end_date:
        session_query = session_query.where(TableSession.created_at <= end_date)

    session_res = await session.execute(session_query)
    branch_session_data = {
        row.branch_id: int(row.session_cnt)
        for row in session_res.all()
    }

    total_network_revenue = sum(
        rev for rev, _ in branch_order_data.values()
    ) if branch_order_data else Decimal("0.00")
    total_network_orders = sum(
        cnt for _, cnt in branch_order_data.values()
    ) if branch_order_data else 0

    comparison_items: list[BranchComparisonItem] = []

    for b in branches:
        rev_usd, ord_cnt = branch_order_data.get(b.id, (Decimal("0.00"), 0))
        sess_cnt = branch_session_data.get(b.id, 0)
        rate = b.exchange_rate or base_rate
        rev_khr = Decimal(_round_khr_to_hundred(rev_usd * rate))
        aov = (rev_usd / Decimal(ord_cnt)).quantize(Decimal("0.01")) if ord_cnt > 0 else Decimal("0.00")
        share = (
            (rev_usd / total_network_revenue * Decimal("100")).quantize(Decimal("0.01"))
            if total_network_revenue > 0
            else Decimal("0.00")
        )

        comparison_items.append(
            BranchComparisonItem(
                branch_id=b.id,
                branch_name=b.name_en,
                branch_code=b.code,
                total_revenue_usd=rev_usd,
                total_revenue_khr=rev_khr,
                order_count=ord_cnt,
                session_count=sess_cnt,
                average_order_value_usd=aov,
                revenue_share_percentage=share,
                rank=0,  # Computed after sorting
            )
        )

    # Sort descending by revenue, then assign rank
    comparison_items.sort(key=lambda x: x.total_revenue_usd, reverse=True)
    for idx, item in enumerate(comparison_items, start=1):
        item.rank = idx

    total_khr = Decimal(_round_khr_to_hundred(total_network_revenue * base_rate))

    return BranchComparisonResponse(
        business_id=business_id,
        start_date=start_date,
        end_date=end_date,
        total_network_revenue_usd=total_network_revenue,
        total_network_revenue_khr=total_khr,
        total_network_orders=total_network_orders,
        branches=comparison_items,
    )


async def get_top_selling_items(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    requested_branch_id: UUID | None = None,
    limit: int = 10,
) -> TopSellingItemsResponse:
    """
    Calculates top-selling menu items ranked by quantity sold and revenue generated.
    """
    effective_branch_id = _resolve_analytics_branch_filter(tenant, requested_branch_id)

    completed_statuses = [
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_TO_SERVE,
        OrderStatus.SERVED,
    ]

    # Query OrderItems joining Orders
    query = (
        select(
            OrderItem.menu_item_id,
            func.sum(OrderItem.quantity).label("total_qty"),
            func.sum(OrderItem.subtotal_price).label("total_rev"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.business_id == business_id,
            Order.organization_id == tenant.organization_id,
            Order.status.in_(completed_statuses),
        )
        .group_by(OrderItem.menu_item_id)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(limit)
    )

    if effective_branch_id:
        query = query.where(Order.branch_id == effective_branch_id)
    if start_date:
        query = query.where(Order.created_at >= start_date)
    if end_date:
        query = query.where(Order.created_at <= end_date)

    res = await session.execute(query)
    top_rows = res.all()

    item_ids = [r.menu_item_id for r in top_rows]
    items_map: dict[UUID, MenuItem] = {}
    if item_ids:
        items_res = await session.execute(
            select(MenuItem)
            .options(selectinload(MenuItem.category))
            .where(MenuItem.id.in_(item_ids))
        )
        items_map = {item.id: item for item in items_res.scalars().all()}

    # Branch code breakdown query for these top items
    branch_breakdown_map: dict[UUID, dict[str, int]] = {}
    if item_ids:
        bk_query = (
            select(
                OrderItem.menu_item_id,
                Branch.code,
                func.sum(OrderItem.quantity).label("b_qty"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .join(Branch, Branch.id == Order.branch_id)
            .where(
                OrderItem.menu_item_id.in_(item_ids),
                Order.business_id == business_id,
                Order.status.in_(completed_statuses),
            )
            .group_by(OrderItem.menu_item_id, Branch.code)
        )
        if start_date:
            bk_query = bk_query.where(Order.created_at >= start_date)
        if end_date:
            bk_query = bk_query.where(Order.created_at <= end_date)

        bk_res = await session.execute(bk_query)
        for r in bk_res.all():
            branch_breakdown_map.setdefault(r.menu_item_id, {})[r.code] = int(r.b_qty)

    top_items: list[TopSellingItemDetail] = []
    for r in top_rows:
        item = items_map.get(r.menu_item_id)
        if item:
            top_items.append(
                TopSellingItemDetail(
                    menu_item_id=item.id,
                    item_name_en=item.name_en,
                    item_name_km=item.name_km,
                    category_name=item.category.name_en if item.category else None,
                    is_local_item=(item.branch_id is not None),
                    origin_branch_id=item.branch_id,
                    total_quantity_sold=int(r.total_qty),
                    total_revenue_usd=Decimal(str(r.total_rev)),
                    branch_breakdown=branch_breakdown_map.get(item.id, {}),
                )
            )

    return TopSellingItemsResponse(
        business_id=business_id,
        branch_id=effective_branch_id,
        start_date=start_date,
        end_date=end_date,
        items=top_items,
    )


async def get_payment_method_breakdown(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    requested_branch_id: UUID | None = None,
) -> PaymentBreakdownResponse:
    """
    Computes breakdown across payment methods (Cash, Bakong KHQR, etc.).
    """
    effective_branch_id = _resolve_analytics_branch_filter(tenant, requested_branch_id)

    # Fetch business exchange rate
    biz_res = await session.execute(
        select(Business).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    business = biz_res.scalar_one_or_none()
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")

    exchange_rate = business.exchange_rate or Decimal("4100.00")

    query = (
        select(
            Payment.payment_method,
            func.coalesce(func.sum(Payment.grand_total_usd), Decimal("0.00")).label("tot_usd"),
            func.coalesce(func.sum(Payment.grand_total_khr), Decimal("0.00")).label("tot_khr"),
            func.count(Payment.id).label("txn_count"),
        )
        .where(
            Payment.business_id == business_id,
            Payment.organization_id == tenant.organization_id,
            Payment.payment_status == PaymentStatus.COMPLETED,
        )
        .group_by(Payment.payment_method)
    )

    if effective_branch_id:
        query = query.where(Payment.branch_id == effective_branch_id)
    if start_date:
        query = query.where(Payment.created_at >= start_date)
    if end_date:
        query = query.where(Payment.created_at <= end_date)

    res = await session.execute(query)
    rows = res.all()

    total_collected_usd = sum(Decimal(str(r.tot_usd)) for r in rows) if rows else Decimal("0.00")
    total_txns = sum(int(r.txn_count) for r in rows) if rows else 0

    methods: list[PaymentMethodMetric] = []
    for r in rows:
        usd_amt = Decimal(str(r.tot_usd))
        khr_amt = Decimal(str(r.tot_khr))
        if khr_amt == 0 and usd_amt > 0:
            khr_amt = Decimal(_round_khr_to_hundred(usd_amt * exchange_rate))

        share = (
            (usd_amt / total_collected_usd * Decimal("100")).quantize(Decimal("0.01"))
            if total_collected_usd > 0
            else Decimal("0.00")
        )

        methods.append(
            PaymentMethodMetric(
                payment_method=r.payment_method.value if hasattr(r.payment_method, "value") else str(r.payment_method),
                total_amount_usd=usd_amt,
                total_amount_khr=khr_amt,
                transaction_count=int(r.txn_count),
                share_percentage=share,
            )
        )

    total_collected_khr = Decimal(_round_khr_to_hundred(total_collected_usd * exchange_rate))

    return PaymentBreakdownResponse(
        business_id=business_id,
        branch_id=effective_branch_id,
        start_date=start_date,
        end_date=end_date,
        total_collected_usd=total_collected_usd,
        total_collected_khr=total_collected_khr,
        total_transactions=total_txns,
        methods=methods,
    )
