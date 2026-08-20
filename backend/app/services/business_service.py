from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.business import Business
from app.schemas.business import BusinessUpdate

logger = structlog.get_logger("app.services.business_service")


async def update_business_profile(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    payload: BusinessUpdate,
) -> Business:
    """
    Updates a business profile belonging to the current tenant organization.

    Enforces tenant isolation by scoping the query to tenant.organization_id.
    Applies partial updates using exclude_unset=True.

    Args:
        session: Database session.
        tenant: Active TenantContext.
        business_id: UUID of the business to update.
        payload: BusinessUpdate payload containing optional fields.

    Returns:
        Updated Business database entity.

    Raises:
        TenantNotFoundError: If the business is not found or belongs to another tenant.
    """
    logger.info(
        "Starting business profile update",
        business_id=str(business_id),
        organization_id=str(tenant.organization_id),
        user_id=str(tenant.user_id),
    )

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
            "Business profile update failed: resource not found or cross-tenant",
            business_id=str(business_id),
            organization_id=str(tenant.organization_id),
            user_id=str(tenant.user_id),
        )
        raise TenantNotFoundError("Business not found.")

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(business, field, value)

    await session.commit()

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="BUSINESS_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="business",
        resource_id=str(business_id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    # Re-query with selectinload to ensure branches relationship is eager loaded
    updated_result = await session.execute(
        select(Business)
        .options(selectinload(Business.branches))
        .where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    updated_business = updated_result.scalar_one()

    logger.info(
        "Business profile updated successfully",
        business_id=str(updated_business.id),
        organization_id=str(tenant.organization_id),
        user_id=str(tenant.user_id),
        updated_fields=list(update_data.keys()),
    )

    return updated_business
