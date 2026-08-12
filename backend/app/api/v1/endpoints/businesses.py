from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.branch import Branch
from app.models.business import Business
from app.schemas.business import BranchResponse, BusinessResponse, BusinessUpdate
from app.services.business_service import update_business_profile

logger = structlog.get_logger("app.api.v1.endpoints.businesses")

router = APIRouter(
    prefix="/businesses",
    tags=["Businesses & Branches"],
)


@router.get(
    "",
    response_model=list[BusinessResponse],
)
async def list_tenant_businesses(
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[BusinessResponse]:
    """
    List all businesses belonging exclusively to the active tenant organization.
    """
    logger.debug(
        "Listing tenant businesses",
        user_id=str(tenant.user_id),
        organization_id=str(tenant.organization_id),
    )

    result = await session.execute(
        select(Business)
        .options(selectinload(Business.branches))
        .where(Business.organization_id == tenant.organization_id)
        .order_by(Business.created_at.asc())
    )
    businesses = result.scalars().all()
    return [BusinessResponse.model_validate(b) for b in businesses]


@router.get(
    "/{business_id}",
    response_model=BusinessResponse,
)
async def get_tenant_business(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BusinessResponse:
    """
    Retrieve a specific business belonging to the active tenant organization.

    Enforces tenant isolation by filtering on organization_id. Returns 404 Not Found
    if the business does not exist or belongs to another tenant.
    """
    result = await session.execute(
        select(Business)
        .options(selectinload(Business.branches))
        .where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    business = result.scalar_one_or_none()

    if business is None:
        logger.warning(
            "Business resource access denied or not found",
            user_id=str(tenant.user_id),
            organization_id=str(tenant.organization_id),
            requested_business_id=str(business_id),
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found.",
        )

    return BusinessResponse.model_validate(business)


@router.patch(
    "/{business_id}",
    response_model=BusinessResponse,
    status_code=status.HTTP_200_OK,
)
async def update_tenant_business(
    business_id: UUID,
    payload: BusinessUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BusinessResponse:
    """
    Partially update a business profile belonging to the active tenant organization.

    Enforces tenant isolation by verifying ownership under tenant.organization_id.
    Returns 404 Not Found if the business does not exist or belongs to another tenant.
    Returns 422 Unprocessable Entity for payload validation errors.
    """
    try:
        updated_business = await update_business_profile(
            session=session,
            tenant=tenant,
            business_id=business_id,
            payload=payload,
        )
        return BusinessResponse.model_validate(updated_business)
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found.",
        ) from exc


@router.get(
    "/{business_id}/branches",
    response_model=list[BranchResponse],
)
async def list_tenant_business_branches(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[BranchResponse]:
    """
    List all branches belonging to a business within the active tenant organization.

    Verifies business ownership under the active tenant before listing branches.
    Returns 404 Not Found if the business belongs to another tenant.
    """
    business_check = await session.execute(
        select(Business.id).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    if business_check.scalar_one_or_none() is None:
        logger.warning(
            "Branches query rejected: business not found for tenant",
            user_id=str(tenant.user_id),
            organization_id=str(tenant.organization_id),
            requested_business_id=str(business_id),
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found.",
        )

    result = await session.execute(
        select(Branch)
        .where(
            Branch.business_id == business_id,
            Branch.organization_id == tenant.organization_id,
        )
        .order_by(Branch.created_at.asc())
    )
    branches = result.scalars().all()
    return [BranchResponse.model_validate(b) for b in branches]
