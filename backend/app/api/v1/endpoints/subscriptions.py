from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import (
    EntitlementLimitExceededError,
    PermissionDeniedError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.subscription import (
    ChangePlanRequest,
    PlanResponse,
    SubscriptionResponse,
)
from app.services.subscription_service import (
    change_organization_plan,
    get_organization_subscription_details,
    list_available_plans,
)

logger = structlog.get_logger("app.api.v1.endpoints.subscriptions")

router = APIRouter(tags=["Subscriptions & Plans"])


@router.get(
    "/plans",
    response_model=list[PlanResponse],
    status_code=status.HTTP_200_OK,
)
async def list_subscription_plans(
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[PlanResponse]:
    """
    List all available public subscription plans and feature matrices.
    """
    plans = await list_available_plans(session)
    return [PlanResponse.model_validate(p) for p in plans]


@router.get(
    "/organizations/{org_id}/subscription",
    response_model=SubscriptionResponse,
    status_code=status.HTTP_200_OK,
)
async def get_tenant_subscription(
    org_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SubscriptionResponse:
    """
    View active subscription status, trial details, and branch/staff resource usage.
    """
    try:
        return await get_organization_subscription_details(
            session=session,
            tenant=tenant,
            org_id=org_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/organizations/{org_id}/subscription/change-plan",
    response_model=SubscriptionResponse,
    status_code=status.HTTP_200_OK,
)
async def change_tenant_subscription_plan(
    org_id: UUID,
    payload: ChangePlanRequest,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SubscriptionResponse:
    """
    Change or upgrade organization subscription plan tier.
    """
    try:
        return await change_organization_plan(
            session=session,
            tenant=tenant,
            org_id=org_id,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except EntitlementLimitExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
