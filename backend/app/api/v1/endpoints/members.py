from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import (
    EntitlementLimitExceededError,
    InvalidTokenError,
    PermissionDeniedError,
    ResourceConflictError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.enums import MembershipStatus, StaffRole
from app.schemas.member import (
    InviteAccept,
    InviteResponse,
    MemberInvite,
    MemberResponse,
    MemberUpdate,
)
from app.services.member_service import (
    accept_invitation,
    get_member,
    invite_member,
    list_members,
    revoke_or_archive_member,
    update_member,
)

logger = structlog.get_logger("app.api.v1.endpoints.members")

router = APIRouter(tags=["Organization Staff & Members"])


@router.post(
    "/organizations/{org_id}/members",
    response_model=InviteResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/organizations/{org_id}/members/invite",
    response_model=InviteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_staff_member(
    org_id: UUID,
    payload: MemberInvite,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> InviteResponse:

    """
    Invite a staff member by email or phone with an assigned role and branch.
    """
    try:
        return await invite_member(
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
    except ResourceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except EntitlementLimitExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.post(
    "/auth/invitations/accept",
    response_model=MemberResponse,
    status_code=status.HTTP_200_OK,
)
async def accept_staff_invitation(
    payload: InviteAccept,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MemberResponse:
    """
    Accept an invitation token, set a new password, and activate membership.
    """
    try:
        return await accept_invitation(
            session=session,
            payload=payload,
        )
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/organizations/{org_id}/members",
    response_model=list[MemberResponse],
    status_code=status.HTTP_200_OK,
)
async def list_staff_members(
    org_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    role: Annotated[StaffRole | None, Query(description="Filter by role")] = None,
    membership_status: Annotated[
        MembershipStatus | None,
        Query(alias="status", description="Filter by status"),
    ] = None,
    branch_id: Annotated[UUID | None, Query(description="Filter by branch ID")] = None,
) -> list[MemberResponse]:
    """
    List staff members in the organization with optional role, status,
    or branch filters.
    """
    try:
        return await list_members(
            session=session,
            tenant=tenant,
            org_id=org_id,
            role=role,
            status=membership_status,
            branch_id=branch_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/organizations/{org_id}/members/{member_id}",
    response_model=MemberResponse,
    status_code=status.HTTP_200_OK,
)
async def get_staff_member(
    org_id: UUID,
    member_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MemberResponse:
    """
    Get details of a specific staff member in the organization.
    """
    try:
        return await get_member(
            session=session,
            tenant=tenant,
            org_id=org_id,
            member_id=member_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.patch(
    "/organizations/{org_id}/members/{member_id}",
    response_model=MemberResponse,
    status_code=status.HTTP_200_OK,
)
async def update_staff_member(
    org_id: UUID,
    member_id: UUID,
    payload: MemberUpdate,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MemberResponse:
    """
    Update staff member role, branch assignment, job title, or status.
    """
    try:
        return await update_member(
            session=session,
            tenant=tenant,
            org_id=org_id,
            member_id=member_id,
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


@router.delete(
    "/organizations/{org_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_staff_member(
    org_id: UUID,
    member_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Revoke access / terminate membership for a staff member.
    """
    try:
        await revoke_or_archive_member(
            session=session,
            tenant=tenant,
            org_id=org_id,
            member_id=member_id,
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
