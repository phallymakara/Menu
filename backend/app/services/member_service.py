import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    InvalidTokenError,
    PermissionDeniedError,
    ResourceConflictError,
    TenantNotFoundError,
)
from app.core.security import hash_password
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.enums import MembershipStatus, StaffRole, UserStatus
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.schemas.member import (
    InviteAccept,
    InviteResponse,
    MemberInvite,
    MemberResponse,
    MemberUpdate,
)

logger = structlog.get_logger("app.services.member_service")


def _hash_token(token: str) -> str:
    """Compute SHA-256 hex digest of a raw token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _verify_admin_access(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
) -> OrganizationMembership:
    """
    Ensures caller has owner or manager privileges within the target organization.
    """
    if tenant.organization_id != org_id:
        raise TenantNotFoundError("Organization not found.")

    result = await session.execute(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.user_id == tenant.user_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
        )
    )
    caller_mem = result.scalar_one_or_none()

    if caller_mem is None:
        raise PermissionDeniedError(
            "Caller is not an active member of this organization."
        )

    if not caller_mem.is_owner and caller_mem.role not in (
        StaffRole.OWNER,
        StaffRole.MANAGER,
    ):
        raise PermissionDeniedError(
            "Only owners and managers can perform staff management operations."
        )

    return caller_mem


async def invite_member(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
    payload: MemberInvite,
) -> InviteResponse:
    """
    Invites a new staff member by email or phone.

    Generates a secure token with a 7-day expiration.
    """
    await _verify_admin_access(session, tenant, org_id)

    # 1. Check subscription staff limit entitlement
    from app.services.subscription_service import check_staff_entitlement

    await check_staff_entitlement(session, org_id)

    # 2. Validate branch_id if provided
    if payload.branch_id is not None:
        branch_check = await session.execute(
            select(Branch.id).where(
                Branch.id == payload.branch_id,
                Branch.organization_id == org_id,
            )
        )
        if branch_check.scalar_one_or_none() is None:
            raise TenantNotFoundError("Assigned branch not found in organization.")

    # 2. Find or create user
    user: User | None = None
    conditions = []
    if payload.email:
        conditions.append(User.email == payload.email)
    if payload.phone:
        conditions.append(User.phone == payload.phone)

    if conditions:
        user_result = await session.execute(select(User).where(or_(*conditions)))
        user = user_result.scalar_one_or_none()

    if user is None:
        # Create a user (activated if password is provided directly, otherwise invited)
        user = User(
            email=payload.email,
            phone=payload.phone,
            full_name=payload.full_name,
            avatar_url=payload.avatar_url,
            password_hash=hash_password(payload.password) if payload.password else hash_password(secrets.token_urlsafe(24)),
            status=UserStatus.ACTIVE if payload.password else UserStatus.INVITED,
            is_verified=bool(payload.password),
        )
        session.add(user)
        await session.flush()
    else:
        if payload.avatar_url:
            user.avatar_url = payload.avatar_url
        if payload.password:
            user.password_hash = hash_password(payload.password)
            user.status = UserStatus.ACTIVE

    # 3. Check existing membership in this organization
    mem_result = await session.execute(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.user_id == user.id,
        )
    )
    membership = mem_result.scalar_one_or_none()

    if membership is not None and membership.status == MembershipStatus.ACTIVE:
        raise ResourceConflictError(
            "User is already an active member of this organization."
        )

    # 4. Generate invitation token and 7-day expiration
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(days=7)

    membership_status = MembershipStatus.ACTIVE if payload.password else MembershipStatus.INVITED

    if membership is None:
        membership = OrganizationMembership(
            organization_id=org_id,
            user_id=user.id,
            branch_id=payload.branch_id,
            role=payload.role,
            status=membership_status,
            job_title=payload.job_title,
            pos_pin=payload.pos_pin,
            is_owner=(payload.role == StaffRole.OWNER),
            invitation_token_hash=token_hash if not payload.password else None,
            invitation_expires_at=expires_at if not payload.password else None,
            invited_by_user_id=tenant.user_id,
        )
        session.add(membership)
    else:
        membership.branch_id = payload.branch_id
        membership.role = payload.role
        membership.status = membership_status
        membership.job_title = payload.job_title
        membership.pos_pin = payload.pos_pin
        membership.invitation_token_hash = token_hash if not payload.password else None
        membership.invitation_expires_at = expires_at if not payload.password else None
        membership.invited_by_user_id = tenant.user_id

    await session.commit()
    await session.refresh(membership)

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="STAFF_INVITED",
        organization_id=org_id,
        user_id=tenant.user_id,
        resource_type="member",
        resource_id=str(membership.id),
        details={"invited_email": payload.email, "role": payload.role.value, "branch_id": str(payload.branch_id) if payload.branch_id else None},
    )
    await session.commit()

    logger.info(
        "Staff member invited successfully",
        org_id=str(org_id),
        user_id=str(user.id),
        role=payload.role.value,
        invited_by=str(tenant.user_id),
    )

    return InviteResponse(
        member_id=membership.id,
        user_id=user.id,
        organization_id=org_id,
        role=membership.role,
        status=membership.status,
        invitation_token=raw_token,
        expires_at=expires_at,
        email=user.email,
        phone=user.phone,
        pos_pin=membership.pos_pin,
        avatar_url=user.avatar_url,
    )



async def accept_invitation(
    session: AsyncSession,
    payload: InviteAccept,
) -> MemberResponse:
    """
    Accepts an invitation token, sets user password, and activates the membership.
    """
    token_hash = _hash_token(payload.token)
    now = datetime.now(UTC)

    result = await session.execute(
        select(OrganizationMembership)
        .options(selectinload(OrganizationMembership.user))
        .where(OrganizationMembership.invitation_token_hash == token_hash)
    )
    membership = result.scalar_one_or_none()

    if membership is None:
        raise InvalidTokenError("Invalid invitation token.")

    expires_at = membership.invitation_expires_at
    if expires_at is None:
        raise InvalidTokenError("Invitation token has expired.")

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if expires_at < now:
        raise InvalidTokenError("Invitation token has expired.")

    # Activate User
    user = membership.user
    user.password_hash = hash_password(payload.password)
    user.status = UserStatus.ACTIVE
    user.is_verified = True
    if payload.full_name:
        user.full_name = payload.full_name

    # Activate Membership
    membership.status = MembershipStatus.ACTIVE
    membership.invitation_token_hash = None
    membership.invitation_expires_at = None

    await session.commit()
    await session.refresh(membership)

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="STAFF_INVITATION_ACCEPTED",
        organization_id=membership.organization_id,
        user_id=user.id,
        resource_type="member",
        resource_id=str(membership.id),
        details={"email": user.email, "role": membership.role.value},
    )
    await session.commit()

    logger.info(
        "Staff invitation accepted and membership activated",
        member_id=str(membership.id),
        org_id=str(membership.organization_id),
        user_id=str(user.id),
    )

    return MemberResponse(
        id=membership.id,
        organization_id=membership.organization_id,
        user_id=user.id,
        email=user.email,
        phone=user.phone,
        full_name=user.full_name,
        role=membership.role,
        is_owner=membership.is_owner,
        job_title=membership.job_title,
        status=membership.status,
        branch_id=membership.branch_id,
        created_at=membership.created_at,
        updated_at=membership.updated_at,
    )


async def list_members(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
    role: StaffRole | None = None,
    status: MembershipStatus | None = None,
    branch_id: UUID | None = None,
) -> list[MemberResponse]:
    """
    Lists staff members of an organization with optional filters.
    """
    if tenant.organization_id != org_id:
        raise TenantNotFoundError("Organization not found.")

    query = (
        select(OrganizationMembership)
        .options(selectinload(OrganizationMembership.user))
        .where(OrganizationMembership.organization_id == org_id)
    )

    if role is not None:
        query = query.where(OrganizationMembership.role == role)
    if status is not None:
        query = query.where(OrganizationMembership.status == status)
    if branch_id is not None:
        query = query.where(OrganizationMembership.branch_id == branch_id)

    query = query.order_by(OrganizationMembership.created_at.asc())
    result = await session.execute(query)
    memberships = result.scalars().all()

    return [
        MemberResponse(
            id=m.id,
            organization_id=m.organization_id,
            user_id=m.user.id,
            email=m.user.email,
            phone=m.user.phone,
            full_name=m.user.full_name,
            avatar_url=m.user.avatar_url,
            role=m.role,
            is_owner=m.is_owner,
            job_title=m.job_title,
            pos_pin=m.pos_pin,
            status=m.status,
            branch_id=m.branch_id,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in memberships
    ]


async def get_member(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
    member_id: UUID,
) -> MemberResponse:
    """
    Retrieves details of a specific staff member.
    """
    if tenant.organization_id != org_id:
        raise TenantNotFoundError("Organization not found.")

    result = await session.execute(
        select(OrganizationMembership)
        .options(selectinload(OrganizationMembership.user))
        .where(
            OrganizationMembership.id == member_id,
            OrganizationMembership.organization_id == org_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise TenantNotFoundError("Staff member not found.")

    return MemberResponse(
        id=membership.id,
        organization_id=membership.organization_id,
        user_id=membership.user.id,
        email=membership.user.email,
        phone=membership.user.phone,
        full_name=membership.user.full_name,
        avatar_url=membership.user.avatar_url,
        role=membership.role,
        is_owner=membership.is_owner,
        job_title=membership.job_title,
        pos_pin=membership.pos_pin,
        status=membership.status,
        branch_id=membership.branch_id,
        created_at=membership.created_at,
        updated_at=membership.updated_at,
    )


async def update_member(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
    member_id: UUID,
    payload: MemberUpdate,
) -> MemberResponse:
    """
    Updates a staff member's role, branch assignment, title, PIN, avatar, or status.
    """
    caller = await _verify_admin_access(session, tenant, org_id)

    result = await session.execute(
        select(OrganizationMembership)
        .options(selectinload(OrganizationMembership.user))
        .where(
            OrganizationMembership.id == member_id,
            OrganizationMembership.organization_id == org_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise TenantNotFoundError("Staff member not found.")

    # Guard: only owner can edit another owner
    if membership.is_owner and not caller.is_owner:
        raise PermissionDeniedError(
            "Only organization owners can modify owner accounts."
        )

    # Validate new branch_id if provided
    if payload.branch_id is not None:
        branch_check = await session.execute(
            select(Branch.id).where(
                Branch.id == payload.branch_id,
                Branch.organization_id == org_id,
            )
        )
        if branch_check.scalar_one_or_none() is None:
            raise TenantNotFoundError("Assigned branch not found in organization.")

    update_data = payload.model_dump(exclude_unset=True)

    # User fields
    if "full_name" in update_data and update_data["full_name"] is not None:
        membership.user.full_name = update_data.pop("full_name")
    if "phone" in update_data:
        membership.user.phone = update_data.pop("phone")
    if "email" in update_data:
        membership.user.email = update_data.pop("email")
    if "avatar_url" in update_data:
        membership.user.avatar_url = update_data.pop("avatar_url")

    # Membership fields
    for field, value in update_data.items():
        setattr(membership, field, value)

    # If role changed to OWNER, set is_owner
    if "role" in update_data:
        membership.is_owner = update_data["role"] == StaffRole.OWNER


    await session.commit()
    await session.refresh(membership)

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="STAFF_UPDATED",
        organization_id=org_id,
        user_id=tenant.user_id,
        resource_type="member",
        resource_id=str(member_id),
        details={"updated_fields": list(update_data.keys())},
    )
    await session.commit()

    logger.info(
        "Staff member updated successfully",
        member_id=str(member_id),
        org_id=str(org_id),
        updated_fields=list(update_data.keys()),
    )

    return MemberResponse(
        id=membership.id,
        organization_id=membership.organization_id,
        user_id=membership.user.id,
        email=membership.user.email,
        phone=membership.user.phone,
        full_name=membership.user.full_name,
        role=membership.role,
        is_owner=membership.is_owner,
        job_title=membership.job_title,
        status=membership.status,
        branch_id=membership.branch_id,
        created_at=membership.created_at,
        updated_at=membership.updated_at,
    )


async def revoke_or_archive_member(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
    member_id: UUID,
) -> None:
    """
    Revokes staff access by setting status to TERMINATED (preserving history).
    """
    caller = await _verify_admin_access(session, tenant, org_id)

    result = await session.execute(
        select(OrganizationMembership).where(
            OrganizationMembership.id == member_id,
            OrganizationMembership.organization_id == org_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise TenantNotFoundError("Staff member not found.")

    if membership.user_id == caller.user_id:
        raise PermissionDeniedError(
            "Owners/managers cannot terminate their own membership."
        )

    if membership.is_owner and not caller.is_owner:
        raise PermissionDeniedError(
            "Only organization owners can terminate owner accounts."
        )

    membership.status = MembershipStatus.TERMINATED
    membership.invitation_token_hash = None
    membership.invitation_expires_at = None

    await session.commit()

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="STAFF_REVOKED",
        organization_id=org_id,
        user_id=tenant.user_id,
        resource_type="member",
        resource_id=str(member_id),
    )
    await session.commit()

    logger.info(
        "Staff member access revoked",
        member_id=str(member_id),
        org_id=str(org_id),
        revoked_by=str(tenant.user_id),
    )
