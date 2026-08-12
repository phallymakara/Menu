from typing import Annotated
from uuid import UUID

import structlog
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.enums import MembershipStatus, OrganizationStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User

logger = structlog.get_logger("app.api.dependencies.tenant")


async def get_current_tenant_context(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    x_organization_id: Annotated[
        str | None,
        Header(alias="X-Organization-Id"),
    ] = None,
) -> TenantContext:
    """
    FastAPI dependency to resolve and validate the active TenantContext
    for an authenticated user request.

    Verifies that:
    1. The authenticated user exists and is active (handled by get_current_user).
    2. The user has an OrganizationMembership record.
    3. The membership status is MembershipStatus.ACTIVE.
    4. The related Organization exists and status is OrganizationStatus.ACTIVE.
    5. The Organization is_active flag is True.

    If X-Organization-Id header is provided, validates access to that specific
    organization. Otherwise, defaults to the user's primary/first active membership.
    """
    target_org_id: UUID | None = None

    if x_organization_id is not None:
        try:
            target_org_id = UUID(x_organization_id)
        except ValueError as exc:
            logger.warning(
                "Tenant context resolution failed: invalid X-Organization-Id format",
                user_id=str(current_user.id),
                raw_header=x_organization_id,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid X-Organization-Id header format.",
            ) from exc

    if target_org_id is not None:
        # User specified an explicit organization context
        result = await session.execute(
            select(OrganizationMembership, Organization)
            .join(
                Organization,
                Organization.id == OrganizationMembership.organization_id,
            )
            .where(
                OrganizationMembership.user_id == current_user.id,
                OrganizationMembership.organization_id == target_org_id,
            )
        )
        row = result.first()

        if row is None:
            logger.warning(
                "Tenant context resolution failed: no membership for requested org",
                user_id=str(current_user.id),
                organization_id=str(target_org_id),
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to requested organization denied.",
            )

        membership, organization = row

        # Validate membership and organization status
        if membership.status != MembershipStatus.ACTIVE:
            logger.warning(
                "Tenant context resolution failed: membership is not active",
                user_id=str(current_user.id),
                organization_id=str(organization.id),
                membership_status=membership.status,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization membership is not active.",
            )

        if (
            organization.status != OrganizationStatus.ACTIVE
            or not organization.is_active
        ):
            logger.warning(
                "Tenant context resolution failed: organization is not active",
                user_id=str(current_user.id),
                organization_id=str(organization.id),
                organization_status=organization.status,
                is_active=organization.is_active,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization is inactive or suspended.",
            )

    else:
        # Default behavior: pick active organization membership
        result = await session.execute(
            select(OrganizationMembership, Organization)
            .join(
                Organization,
                Organization.id == OrganizationMembership.organization_id,
            )
            .where(
                OrganizationMembership.user_id == current_user.id,
                OrganizationMembership.status == MembershipStatus.ACTIVE,
                Organization.status == OrganizationStatus.ACTIVE,
                Organization.is_active.is_(True),
            )
            .order_by(
                OrganizationMembership.is_owner.desc(),
                OrganizationMembership.created_at.asc(),
            )
        )
        rows = result.all()

        if not rows:
            logger.warning(
                "Tenant context resolution failed: no active membership found",
                user_id=str(current_user.id),
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No active organization membership found.",
            )

        membership, organization = rows[0]

    logger.debug(
        "Tenant context resolved successfully",
        user_id=str(current_user.id),
        organization_id=str(organization.id),
        membership_id=str(membership.id),
    )

    return TenantContext(
        user=current_user,
        organization=organization,
        membership=membership,
    )
