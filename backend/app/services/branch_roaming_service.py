from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.enums import StaffRole
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.schemas.branch_roaming import (
    AccessibleBranchInfo,
    MyBranchesResponse,
    SwitchBranchResponse,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.branch_roaming_service")


def can_user_roam_branches(membership: OrganizationMembership) -> bool:
    """
    Determines if user is a Brand Owner or General Manager with universal roaming access.
    Branch Managers (with specific branch_id) and branch staff are locked to their assigned branch.
    """
    if membership.is_owner:
        return True
    if membership.role == StaffRole.MANAGER and membership.branch_id is None:
        return True
    return False


async def get_user_accessible_branches(
    session: AsyncSession,
    user: User,
    tenant: TenantContext,
    current_active_branch_id: UUID | None = None,
) -> MyBranchesResponse:
    """
    Returns all branches the user is authorized to access.
    - Brand Owners & General Managers: see all active branches in the organization.
    - Branch Managers & Staff: see only their single assigned branch.
    """
    membership = tenant.membership
    can_roam = can_user_roam_branches(membership)

    if can_roam:
        # Fetch all active branches in the organization
        res = await session.execute(
            select(Branch)
            .where(
                Branch.organization_id == tenant.organization_id,
                Branch.is_active.is_(True),
            )
            .order_by(Branch.name_en.asc())
        )
        branches = res.scalars().all()
    else:
        # Fetch only the single assigned branch
        if membership.branch_id is None:
            branches = []
        else:
            res = await session.execute(
                select(Branch).where(
                    Branch.id == membership.branch_id,
                    Branch.organization_id == tenant.organization_id,
                    Branch.is_active.is_(True),
                )
            )
            branch = res.scalar_one_or_none()
            branches = [branch] if branch else []

    active_id = current_active_branch_id or membership.branch_id or (branches[0].id if branches else None)

    branch_infos = [
        AccessibleBranchInfo(
            branch_id=b.id,
            branch_name_en=b.name_en,
            branch_name_km=b.name_km,
            branch_code=b.code,
            address=b.address,
            role=membership.role.value,
            is_owner=membership.is_owner,
            is_home_branch=(b.id == membership.branch_id),
            is_active_branch=(b.id == active_id),
        )
        for b in branches
    ]

    return MyBranchesResponse(
        can_switch_branches=can_roam,
        active_branch_id=active_id,
        branches=branch_infos,
    )


async def switch_active_branch(
    session: AsyncSession,
    user: User,
    tenant: TenantContext,
    target_branch_id: UUID,
) -> SwitchBranchResponse:
    """
    Switches active working branch context for Brand Owners and General Managers.
    Raises HTTP 403 for branch managers or branch staff attempting to switch outside their assigned branch.
    """
    membership = tenant.membership
    can_roam = can_user_roam_branches(membership)

    # 1. Access validation
    if not can_roam:
        if membership.branch_id != target_branch_id:
            logger.warning(
                "Unauthorized branch switch attempt",
                user_id=str(user.id),
                user_role=membership.role.value,
                user_branch=str(membership.branch_id),
                target_branch=str(target_branch_id),
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Only Brand Owners and General Managers can switch branch contexts.",
            )

    # 2. Verify target branch exists in the organization
    res = await session.execute(
        select(Branch).where(
            Branch.id == target_branch_id,
            Branch.organization_id == tenant.organization_id,
            Branch.is_active.is_(True),
        )
    )
    target_branch = res.scalar_one_or_none()
    if target_branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target branch not found or inactive.",
        )

    # 3. Issue fresh scoped JWT access token
    new_token = create_access_token(
        user_id=user.id,
        active_branch_id=target_branch.id,
    )

    # 4. Audit Log
    await record_audit_log(
        session=session,
        action="BRANCH_CONTEXT_SWITCHED",
        organization_id=tenant.organization_id,
        user_id=user.id,
        resource_type="branch",
        resource_id=str(target_branch.id),
        details={
            "target_branch_name": target_branch.name_en,
            "target_branch_code": target_branch.code,
            "is_owner": membership.is_owner,
            "role": membership.role.value,
        },
    )
    await session.commit()

    logger.info(
        "Staff switched active branch context",
        user_id=str(user.id),
        target_branch_id=str(target_branch.id),
        target_branch_name=target_branch.name_en,
    )

    return SwitchBranchResponse(
        access_token=new_token,
        token_type="bearer",
        active_branch_id=target_branch.id,
        branch_name_en=target_branch.name_en,
        branch_code=target_branch.code,
        role=membership.role.value,
        is_owner=membership.is_owner,
    )
