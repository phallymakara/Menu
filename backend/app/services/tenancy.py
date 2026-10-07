"""
Shared tenant-scoping lookups for service functions.

Tenant routes take business and branch IDs from the URL path. Before a service
reads or writes anything below them, it must prove that those IDs belong to the
caller's organization. These helpers make that check in one place. A row owned
by another organization is reported exactly like a missing row, so callers
cannot use the response to discover other tenants' IDs.
"""

from __future__ import annotations

from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.business import Business

logger = structlog.get_logger("app.services.tenancy")


async def get_business_for_tenant(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
) -> Business:
    """
    Load a business that belongs to the caller's organization.

    Args:
        session: Active asynchronous database session.
        tenant: Resolved tenant context of the authenticated caller.
        business_id: Business ID taken from the request path.

    Returns:
        The business row.

    Raises:
        TenantNotFoundError: If the business does not exist or belongs to another
            organization.
    """
    result = await session.execute(
        select(Business).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    business = result.scalar_one_or_none()
    if business is None:
        logger.warning(
            "Business not found in tenant scope",
            organization_id=str(tenant.organization_id),
            user_id=str(tenant.user_id),
            business_id=str(business_id),
        )
        raise TenantNotFoundError("Business not found.")
    return business


async def get_branch_for_tenant(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
) -> Branch:
    """
    Load a branch that belongs to the given business and to the caller's organization.

    Args:
        session: Active asynchronous database session.
        tenant: Resolved tenant context of the authenticated caller.
        business_id: Business ID taken from the request path.
        branch_id: Branch ID taken from the request path.

    Returns:
        The branch row.

    Raises:
        TenantNotFoundError: If the branch does not exist, belongs to a different
            business, or belongs to another organization.
    """
    result = await session.execute(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.business_id == business_id,
            Branch.organization_id == tenant.organization_id,
        )
    )
    branch = result.scalar_one_or_none()
    if branch is None:
        logger.warning(
            "Branch not found in tenant scope",
            organization_id=str(tenant.organization_id),
            user_id=str(tenant.user_id),
            business_id=str(business_id),
            branch_id=str(branch_id),
        )
        raise TenantNotFoundError("Branch not found.")
    return branch
