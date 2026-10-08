from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class DelayedOrderItem(BaseModel):
    order_number: str
    elapsed_minutes: int
    status: str


class KitchenSLAMetrics(BaseModel):
    avg_accept_seconds: int = 0
    avg_prep_seconds: int = 0
    avg_serve_seconds: int = 0
    delayed_count: int = 0


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

    # Cost metrics (recipe BOM depletion)
    cost_of_goods_usd: Decimal = Field(
        description=(
            "Ingredient cost of recipe depletions logged in the period: depleted "
            "quantity x unit cost snapshotted at depletion. Includes items voided "
            "after preparation (waste); items without a recipe add nothing."
        )
    )
    gross_margin_usd: Decimal = Field(
        description=(
            "Gross sales minus discounts minus cost of goods. Tax and service "
            "charge are excluded."
        )
    )
    gross_margin_percent: Decimal = Field(
        description=(
            "Gross margin as a percentage of gross sales minus discounts; "
            "0 when there are no net sales."
        )
    )

    # Real-time operational breakdown
    pending_orders: int = Field(default=0, description="Active pending orders")
    cancelled_orders: int = Field(default=0, description="Cancelled/rejected orders")
    payment_success_rate: Decimal = Field(
        default=Decimal("100.00"), description="Percentage of successful payments"
    )
    order_status_counts: dict[str, int] = Field(
        default_factory=dict, description="Breakdown of orders by status"
    )
    order_source_counts: dict[str, int] = Field(
        default_factory=dict, description="Breakdown of orders by source (QR vs Staff)"
    )
    payment_status_counts: dict[str, int] = Field(
        default_factory=dict, description="Breakdown of payments by status"
    )
    hourly_sales: dict[str, float] = Field(
        default_factory=dict, description="Hourly sales sum in USD"
    )
    delayed_orders: list[DelayedOrderItem] = Field(
        default_factory=list, description="Recent orders in kitchen requiring attention"
    )
    kitchen_sla: KitchenSLAMetrics = Field(
        default_factory=KitchenSLAMetrics, description="Kitchen SLA turnaround metrics"
    )


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
