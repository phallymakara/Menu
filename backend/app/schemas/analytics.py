from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class SalesOverviewMetrics(BaseModel):
    """High-level sales and operational summary."""

    business_id: UUID
    branch_id: UUID | None = None
    branch_name: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None

    # Financial metrics
    total_gross_sales_usd: Decimal
    total_discounts_usd: Decimal
    total_tax_usd: Decimal
    total_service_charge_usd: Decimal
    total_net_revenue_usd: Decimal
    total_net_revenue_khr: Decimal
    exchange_rate: Decimal

    # Operational metrics
    total_completed_orders: int
    total_closed_sessions: int
    average_order_value_usd: Decimal
    average_session_spend_usd: Decimal


class BranchComparisonItem(BaseModel):
    """Comparative performance metrics for a single branch."""

    branch_id: UUID
    branch_name: str
    branch_code: str
    total_revenue_usd: Decimal
    total_revenue_khr: Decimal
    order_count: int
    session_count: int
    average_order_value_usd: Decimal
    revenue_share_percentage: Decimal
    rank: int


class BranchComparisonResponse(BaseModel):
    """Multi-branch performance leaderboard and comparison matrix."""

    business_id: UUID
    start_date: datetime | None = None
    end_date: datetime | None = None
    total_network_revenue_usd: Decimal
    total_network_revenue_khr: Decimal
    total_network_orders: int
    branches: list[BranchComparisonItem]


class TopSellingItemDetail(BaseModel):
    """Aggregated sales performance for a single menu item."""

    menu_item_id: UUID
    item_name_en: str
    item_name_km: str | None = None
    category_name: str | None = None
    is_local_item: bool
    origin_branch_id: UUID | None = None
    total_quantity_sold: int
    total_revenue_usd: Decimal
    branch_breakdown: dict[str, int] = Field(
        default_factory=dict,
        description="Quantity sold broken down by branch code",
    )


class TopSellingItemsResponse(BaseModel):
    """Network-wide or branch-specific top-performing menu items."""

    business_id: UUID
    branch_id: UUID | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    items: list[TopSellingItemDetail]


class PaymentMethodMetric(BaseModel):
    """Metrics for a specific payment channel."""

    payment_method: str
    total_amount_usd: Decimal
    total_amount_khr: Decimal
    transaction_count: int
    share_percentage: Decimal


class PaymentBreakdownResponse(BaseModel):
    """Breakdown of payment channels (Bakong KHQR vs. Cash USD/KHR)."""

    business_id: UUID
    branch_id: UUID | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    total_collected_usd: Decimal
    total_collected_khr: Decimal
    total_transactions: int
    methods: list[PaymentMethodMetric]
