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
from app.core.security import hash_password_async
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
    resolve_pos_permissions,
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

    Accounts that already exist on the platform are never modified here: their
    password, status, and profile stay untouched, and they join as INVITED until
    they accept the invitation themselves.
    """
    caller = await _verify_admin_access(session, tenant, org_id)

    if payload.role in (StaffRole.OWNER, StaffRole.MANAGER) and not caller.is_owner:
        raise PermissionDeniedError(
            "Only organization owners can grant owner or manager roles."
        )

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

    is_new_user = user is None
    if user is None:
        # Create a user (activated if password is provided directly, otherwise invited)
        user = User(
            email=payload.email,
            phone=payload.phone,
            full_name=payload.full_name,
            avatar_url=payload.avatar_url,
            password_hash=await hash_password_async(
                payload.password or secrets.token_urlsafe(24)
            ),
            status=UserStatus.ACTIVE if payload.password else UserStatus.INVITED,
            is_verified=bool(payload.password),
        )
        session.add(user)
        await session.flush()

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

    # An unclaimed account belongs to the organization whose invitation created it.
    # Letting another organization invite it would let that organization set its
    # password through its own invitation token and claim the account.
    if not is_new_user and user.status == UserStatus.INVITED and membership is None:
        raise ResourceConflictError(
            "This person already has a pending invitation. "
            "They must accept it before joining another organization."
        )

    # Credentials may only be set for an account this organization created and
    # that has not been claimed yet.
    can_set_credentials = is_new_user or user.status == UserStatus.INVITED
    activate_directly = bool(payload.password) and can_set_credentials
    if activate_directly and not is_new_user and payload.password:
        user.password_hash = await hash_password_async(payload.password)
        user.status = UserStatus.ACTIVE
        user.is_verified = True
        if payload.avatar_url:
            user.avatar_url = payload.avatar_url

    # 4. Generate invitation token and 7-day expiration
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(days=7)

    membership_status = (
        MembershipStatus.ACTIVE if activate_directly else MembershipStatus.INVITED
    )

    pos_perms = None
    if payload.pos_permissions:
        pos_perms = (
            payload.pos_permissions.model_dump()
            if hasattr(payload.pos_permissions, "model_dump")
            else dict(payload.pos_permissions)
        )

    if membership is None:
        membership = OrganizationMembership(
            organization_id=org_id,
            user_id=user.id,
            branch_id=payload.branch_id,
            role=payload.role,
            status=membership_status,
            job_title=payload.job_title,
            pos_pin=payload.pos_pin,
            pos_permissions=pos_perms,
            is_owner=(payload.role == StaffRole.OWNER),
            invitation_token_hash=None if activate_directly else token_hash,
            invitation_expires_at=None if activate_directly else expires_at,
            invited_by_user_id=tenant.user_id,
        )
        session.add(membership)
    else:
        membership.branch_id = payload.branch_id
        membership.role = payload.role
        membership.is_owner = payload.role == StaffRole.OWNER
        membership.status = membership_status
        membership.job_title = payload.job_title
        membership.pos_pin = payload.pos_pin
        if pos_perms is not None:
            membership.pos_permissions = pos_perms
        membership.invitation_token_hash = None if activate_directly else token_hash
        membership.invitation_expires_at = None if activate_directly else expires_at
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
        details={
            "invited_email": payload.email,
            "role": payload.role.value,
            "branch_id": str(payload.branch_id) if payload.branch_id else None,
        },
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
    Claims an unclaimed account through its invitation token.

    Sets the account password and activates the membership. The token is handed to
    the inviting organization, so it must never be enough to act on an account that
    already exists: those accounts accept through accept_invitation_for_user while
    signed in.
    """
    membership = await _get_pending_invitation(session, payload.token)

    user = membership.user
    if user.status != UserStatus.INVITED:
        raise PermissionDeniedError(
            "This invitation is for an existing account. "
            "Sign in to that account to accept it."
        )

    user.password_hash = await hash_password_async(payload.password)
    user.status = UserStatus.ACTIVE
    user.is_verified = True
    if payload.full_name:
        user.full_name = payload.full_name

    return await _activate_invited_membership(session, membership)


async def accept_invitation_for_user(
    session: AsyncSession,
    user: User,
    token: str,
) -> MemberResponse:
    """
    Accepts an invitation addressed to the signed-in user's existing account.

    Requires both the invitation token and a session for the invited account, so
    neither the inviter (who holds the token) nor anyone else signed in can accept
    on the account owner's behalf.
    """
    membership = await _get_pending_invitation(session, token)

    if membership.user_id != user.id:
        raise PermissionDeniedError("This invitation belongs to a different account.")

    return await _activate_invited_membership(session, membership)


async def _get_pending_invitation(
    session: AsyncSession,
    token: str,
) -> OrganizationMembership:
    """Returns the membership for a valid, unexpired invitation token."""
    token_hash = _hash_token(token)
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

    return membership


async def _activate_invited_membership(
    session: AsyncSession,
    membership: OrganizationMembership,
) -> MemberResponse:
    """Activates an accepted membership, consumes its token, and records the audit entry."""
    user = membership.user

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
        pos_pin=membership.pos_pin,
        pos_permissions=resolve_pos_permissions(
            membership.role, membership.is_owner, membership.pos_permissions
        ),
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
            pos_permissions=resolve_pos_permissions(
                m.role, m.is_owner, m.pos_permissions
            ),
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
        pos_permissions=resolve_pos_permissions(
            membership.role, membership.is_owner, membership.pos_permissions
        ),
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

    is_self = membership.user_id == caller.user_id
    if is_self and ("role" in update_data or "status" in update_data):
        raise PermissionDeniedError("You cannot change your own role or status.")

    if "role" in update_data and not caller.is_owner:
        privileged = (StaffRole.OWNER, StaffRole.MANAGER)
        if update_data["role"] in privileged or membership.role in privileged:
            raise PermissionDeniedError(
                "Only organization owners can grant or revoke owner or manager roles."
            )

    # Profile fields live on the platform-wide user account. Another organization
    # must not be able to rewrite the identity of an account it does not own.
    changes_identity = any(
        field in update_data
        and update_data[field] != getattr(membership.user, field)
        and not (field == "full_name" and update_data[field] is None)
        for field in ("full_name", "phone", "email", "avatar_url")
    )
    if changes_identity:
        other_memberships = await session.execute(
            select(OrganizationMembership.id)
            .where(
                OrganizationMembership.user_id == membership.user_id,
                OrganizationMembership.organization_id != org_id,
            )
            .limit(1)
        )
        if (
            membership.user.is_platform_admin
            or other_memberships.scalar_one_or_none() is not None
        ):
            raise PermissionDeniedError(
                "This account is shared with other organizations. "
                "Only its owner can change its profile details."
            )

    # User fields
    if "full_name" in update_data and update_data["full_name"] is not None:
        membership.user.full_name = update_data.pop("full_name")
    if "phone" in update_data:
        membership.user.phone = update_data.pop("phone")
    if "email" in update_data:
        membership.user.email = update_data.pop("email")
    if "avatar_url" in update_data:
        membership.user.avatar_url = update_data.pop("avatar_url")

    # POS permissions handling
    if "pos_permissions" in update_data:
        raw_perms = update_data.pop("pos_permissions")
        if hasattr(raw_perms, "model_dump"):
            membership.pos_permissions = raw_perms.model_dump()
        elif isinstance(raw_perms, dict):
            membership.pos_permissions = raw_perms
        else:
            membership.pos_permissions = None

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
        pos_pin=membership.pos_pin,
        pos_permissions=resolve_pos_permissions(
            membership.role, membership.is_owner, membership.pos_permissions
        ),
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


async def verify_manager_pin(
    session: AsyncSession,
    tenant: TenantContext,
    org_id: UUID,
    pin_code: str,
    required_permission: str | None = None,
    branch_id: UUID | None = None,
) -> tuple[bool, str | None, str | None]:
    """
    Verifies if a 4-digit PIN belongs to an active Owner or Manager (or authorized staff)
    in the organization/branch to approve a sensitive POS operation.
    """
    if tenant.organization_id != org_id:
        raise TenantNotFoundError("Organization not found.")

    query = (
        select(OrganizationMembership)
        .options(selectinload(OrganizationMembership.user))
        .where(
            OrganizationMembership.organization_id == org_id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
            OrganizationMembership.pos_pin == pin_code.strip(),
        )
    )
    if branch_id:
        query = query.where(
            or_(
                OrganizationMembership.branch_id == branch_id,
                OrganizationMembership.branch_id.is_(None),
                OrganizationMembership.is_owner.is_(True),
            )
        )

    result = await session.execute(query)
    memberships = result.scalars().all()

    for m in memberships:
        # Check if owner or manager
        if m.is_owner or m.role in (StaffRole.OWNER, StaffRole.MANAGER):
            return True, m.user.full_name, m.role.value
        # If specific permission required, check if granted
        perms = resolve_pos_permissions(m.role, m.is_owner, m.pos_permissions)
        if required_permission:
            if getattr(perms, required_permission, False):
                return True, m.user.full_name, m.role.value
        else:
            if (
                perms.can_void_item
                or perms.can_cancel_order
                or perms.can_override_price
            ):
                return True, m.user.full_name, m.role.value

    return False, None, None
