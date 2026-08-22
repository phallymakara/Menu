from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.analytics import (
    BranchComparisonResponse,
    PaymentBreakdownResponse,
    SalesOverviewMetrics,
    TopSellingItemsResponse,
)
from app.services.analytics_service import (
    get_branch_comparison,
    get_payment_method_breakdown,
    get_sales_overview,
    get_top_selling_items,
)

router = APIRouter(
    prefix="/businesses/{business_id}/analytics",
    tags=["Centralized Analytics & Multi-Branch Sales Rollup"],
)


@router.get(
    "/overview",
    response_model=SalesOverviewMetrics,
    status_code=status.HTTP_200_OK,
    summary="Consolidated sales, revenue, tax, and order volume summary",
)
async def get_sales_overview_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    start_date: Annotated[datetime | None, Query(description="Start timestamp filter")] = None,
    end_date: Annotated[datetime | None, Query(description="End timestamp filter")] = None,
    branch_id: Annotated[UUID | None, Query(description="Optional branch filter (for Owners/GMs)")] = None,
) -> SalesOverviewMetrics:
    """
    Returns high-level sales and operational overview.
    - Brand Owners and General Managers can view consolidated network totals or filter by branch.
    - Branch Managers see metrics strictly scoped to their assigned branch.
    """
    return await get_sales_overview(
        session=session,
        tenant=tenant,
        business_id=business_id,
        start_date=start_date,
        end_date=end_date,
        requested_branch_id=branch_id,
    )


@router.get(
    "/branch-comparison",
    response_model=BranchComparisonResponse,
    status_code=status.HTTP_200_OK,
    summary="Multi-branch performance ranking and revenue share matrix (HQ only)",
)
async def get_branch_comparison_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    start_date: Annotated[datetime | None, Query(description="Start timestamp filter")] = None,
    end_date: Annotated[datetime | None, Query(description="End timestamp filter")] = None,
) -> BranchComparisonResponse:
    """
    Generates a comparative performance matrix ranking all active branches
    by net revenue, order volume, and revenue share percentage.
    Restricted strictly to Brand Owners and General Managers.
    """
    return await get_branch_comparison(
        session=session,
        tenant=tenant,
        business_id=business_id,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/top-items",
    response_model=TopSellingItemsResponse,
    status_code=status.HTTP_200_OK,
    summary="Top-selling menu items ranked by quantity and revenue",
)
async def get_top_items_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    start_date: Annotated[datetime | None, Query(description="Start timestamp filter")] = None,
    end_date: Annotated[datetime | None, Query(description="End timestamp filter")] = None,
    branch_id: Annotated[UUID | None, Query(description="Optional branch filter (for Owners/GMs)")] = None,
    limit: Annotated[int, Query(ge=1, le=50, description="Max items to return")] = 10,
) -> TopSellingItemsResponse:
    """
    Returns top-performing menu items across the network or for a specific branch,
    including quantity breakdowns per branch code.
    """
    return await get_top_selling_items(
        session=session,
        tenant=tenant,
        business_id=business_id,
        start_date=start_date,
        end_date=end_date,
        requested_branch_id=branch_id,
        limit=limit,
    )


@router.get(
    "/payment-breakdown",
    response_model=PaymentBreakdownResponse,
    status_code=status.HTTP_200_OK,
    summary="Payment method distribution (Bakong KHQR vs. Cash USD/KHR)",
)
async def get_payment_breakdown_endpoint(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    start_date: Annotated[datetime | None, Query(description="Start timestamp filter")] = None,
    end_date: Annotated[datetime | None, Query(description="End timestamp filter")] = None,
    branch_id: Annotated[UUID | None, Query(description="Optional branch filter (for Owners/GMs)")] = None,
) -> PaymentBreakdownResponse:
    """
    Returns payment channel breakdown (Bakong KHQR, Cash USD, Cash KHR)
    with transaction counts and revenue share percentages.
    """
    return await get_payment_method_breakdown(
        session=session,
        tenant=tenant,
        business_id=business_id,
        start_date=start_date,
        end_date=end_date,
        requested_branch_id=branch_id,
    )
