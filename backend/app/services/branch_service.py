from decimal import Decimal
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceConflictError, TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.business import Business
from app.schemas.branch import BranchCreate, BranchUpdate

logger = structlog.get_logger("app.services.branch_service")


async def create_branch(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    payload: BranchCreate,
) -> Branch:
    """
    Creates a new branch for a business under the active tenant.

    Enforces tenant isolation by verifying that the business belongs to
    tenant.organization_id.

    Args:
        session: Database async session.
        tenant: Active TenantContext.
        business_id: UUID of the parent business.
        payload: BranchCreate schema with operational settings.

    Returns:
        Created Branch entity.

    Raises:
        TenantNotFoundError: If business is not found or belongs to another tenant.
        ResourceConflictError: If branch code already exists for this business.
    """
    logger.info(
        "Creating new branch",
        business_id=str(business_id),
        organization_id=str(tenant.organization_id),
        user_id=str(tenant.user_id),
        branch_code=payload.code,
    )

    # 1. Verify business ownership under active tenant
    biz_result = await session.execute(
        select(Business).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    business = biz_result.scalar_one_or_none()
    if business is None:
        logger.warning(
            "Branch creation failed: business not found for tenant",
            business_id=str(business_id),
            organization_id=str(tenant.organization_id),
        )
        raise TenantNotFoundError("Business not found.")

    # 2. Check subscription branch limit entitlement
    from app.services.subscription_service import check_branch_entitlement

    await check_branch_entitlement(session, tenant.organization_id)

    # 3. Check branch code uniqueness within the business
    existing_code = await session.execute(
        select(Branch.id).where(
            Branch.business_id == business_id,
            Branch.organization_id == tenant.organization_id,
            Branch.code == payload.code,
        )
    )
    if existing_code.scalar_one_or_none() is not None:
        logger.warning(
            "Branch creation failed: duplicate branch code",
            business_id=str(business_id),
            branch_code=payload.code,
        )
        raise ResourceConflictError(
            f"Branch code '{payload.code}' already exists for this business."
        )

    # 3. Create branch record
    branch_data = payload.model_dump()
    branch = Branch(
        organization_id=tenant.organization_id,
        business_id=business_id,
        **branch_data,
    )
    session.add(branch)
    await session.commit()
    await session.refresh(branch)

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="BRANCH_CREATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="branch",
        resource_id=str(branch.id),
        details={"code": branch.code, "name_en": branch.name_en},
    )
    await session.commit()

    logger.info(
        "Branch created successfully",
        branch_id=str(branch.id),
        business_id=str(business_id),
        organization_id=str(tenant.organization_id),
        code=branch.code,
    )
    return branch


async def get_branch(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
) -> Branch:
    """
    Retrieves a specific branch ensuring strict tenant and business isolation.

    Args:
        session: Database async session.
        tenant: Active TenantContext.
        business_id: UUID of the parent business.
        branch_id: UUID of the branch.

    Returns:
        Branch database entity.

    Raises:
        TenantNotFoundError: If branch is not found or cross-tenant.
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
            "Branch retrieval failed: branch not found or cross-tenant access",
            branch_id=str(branch_id),
            business_id=str(business_id),
            organization_id=str(tenant.organization_id),
        )
        raise TenantNotFoundError("Branch not found.")

    return branch


async def list_branches(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    is_active: bool | None = None,
) -> list[Branch]:
    """
    Lists branches belonging to a tenant business with optional is_active filtering.

    Args:
        session: Database async session.
        tenant: Active TenantContext.
        business_id: UUID of the parent business.
        is_active: Optional boolean filter for active/inactive branches.

    Returns:
        List of Branch entities.

    Raises:
        TenantNotFoundError: If the business is not found or belongs to another tenant.
    """
    # Verify business ownership under active tenant
    biz_check = await session.execute(
        select(Business.id).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    if biz_check.scalar_one_or_none() is None:
        logger.warning(
            "Branch list failed: business not found for tenant",
            business_id=str(business_id),
            organization_id=str(tenant.organization_id),
        )
        raise TenantNotFoundError("Business not found.")

    query = select(Branch).where(
        Branch.business_id == business_id,
        Branch.organization_id == tenant.organization_id,
    )
    if is_active is not None:
        query = query.where(Branch.is_active == is_active)

    query = query.order_by(Branch.created_at.asc())
    result = await session.execute(query)
    return list(result.scalars().all())


async def update_branch(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    payload: BranchUpdate,
) -> Branch:
    """
    Partially updates a branch profile and operational settings.

    Args:
        session: Database async session.
        tenant: Active TenantContext.
        business_id: UUID of the parent business.
        branch_id: UUID of the branch.
        payload: BranchUpdate with fields to modify.

    Returns:
        Updated Branch database entity.

    Raises:
        TenantNotFoundError: If branch is not found for tenant/business.
        ResourceConflictError: If new code conflicts with another branch.
    """
    branch = await get_branch(session, tenant, business_id, branch_id)

    update_data = payload.model_dump(exclude_unset=True)

    # If code is being updated, verify uniqueness
    if "code" in update_data and update_data["code"] != branch.code:
        existing_code = await session.execute(
            select(Branch.id).where(
                Branch.business_id == business_id,
                Branch.organization_id == tenant.organization_id,
                Branch.code == update_data["code"],
                Branch.id != branch_id,
            )
        )
        if existing_code.scalar_one_or_none() is not None:
            raise ResourceConflictError(
                f"Branch code '{update_data['code']}' is already in use."
            )

    for field, value in update_data.items():
        setattr(branch, field, value)

    await session.commit()
    await session.refresh(branch)

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="BRANCH_UPDATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="branch",
        resource_id=str(branch.id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info(
        "Branch updated successfully",
        branch_id=str(branch.id),
        business_id=str(business_id),
        organization_id=str(tenant.organization_id),
        updated_fields=list(update_data.keys()),
    )
    return branch


async def delete_branch(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
) -> None:
    """
    Deletes a branch entity ensuring tenant isolation.

    Args:
        session: Database async session.
        tenant: Active TenantContext.
        business_id: UUID of the parent business.
        branch_id: UUID of the branch to delete.

    Raises:
        TenantNotFoundError: If branch is not found.
    """
    branch = await get_branch(session, tenant, business_id, branch_id)
    await session.delete(branch)
    await session.commit()

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="BRANCH_DELETED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="branch",
        resource_id=str(branch_id),
    )
    await session.commit()

    logger.info(
        "Branch deleted successfully",
        branch_id=str(branch_id),
        business_id=str(business_id),
        organization_id=str(tenant.organization_id),
    )


def calculate_order_totals(
    subtotal: Decimal,
    base_currency: str,
    exchange_rate: Decimal,
    tax_percentage: Decimal = Decimal("0.00"),
    is_tax_inclusive: bool = True,
    service_charge_percentage: Decimal = Decimal("0.00"),
    is_service_charge_inclusive: bool = False,
) -> dict[str, Decimal]:
    """
    Computes tax, service charge, grand total, and dual-currency conversion.

    Returns breakdown with subtotal, tax_amount, service_charge_amount,
    total_in_base_currency, total_in_alt_currency (KHR/USD).
    """
    # 1. Calculate Service Charge
    if is_service_charge_inclusive:
        # Price includes service charge: SC = subtotal - (subtotal / (1 + rate))
        service_charge = subtotal - (
            subtotal
            / (Decimal("1.00") + (service_charge_percentage / Decimal("100.00")))
        )
    else:
        service_charge = subtotal * (service_charge_percentage / Decimal("100.00"))

    # 2. Calculate Tax (VAT)
    taxable_base = (
        subtotal if is_service_charge_inclusive else (subtotal + service_charge)
    )
    if is_tax_inclusive:
        tax_amount = taxable_base - (
            taxable_base / (Decimal("1.00") + (tax_percentage / Decimal("100.00")))
        )
    else:
        tax_amount = taxable_base * (tax_percentage / Decimal("100.00"))

    # 3. Calculate Grand Total in base currency
    if is_tax_inclusive and is_service_charge_inclusive:
        total_base = subtotal
    elif is_tax_inclusive and not is_service_charge_inclusive:
        total_base = subtotal + service_charge
    elif not is_tax_inclusive and is_service_charge_inclusive:
        total_base = subtotal + tax_amount
    else:
        total_base = subtotal + service_charge + tax_amount

    # 4. Dual currency conversion (USD <-> KHR)
    if base_currency.upper() == "USD":
        total_alt = (total_base * exchange_rate).quantize(Decimal("1.00"))
    else:
        total_alt = (total_base / exchange_rate).quantize(Decimal("0.01"))

    return {
        "subtotal": subtotal.quantize(Decimal("0.01")),
        "service_charge": service_charge.quantize(Decimal("0.01")),
        "tax_amount": tax_amount.quantize(Decimal("0.01")),
        "total_base": total_base.quantize(Decimal("0.01")),
        "total_alt": total_alt,
    }
