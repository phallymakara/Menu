"""
Guest service requests: guests raise them from their table, staff work them in the POS.

Guests authenticate with the session token of a live table session. Staff calls are
scoped to the tenant's organization and, for branch-locked staff, their own branch;
the staff router's RBAC dependency requires ``SERVE_TABLES`` to change a request.
Every state change is broadcast after commit to the branch POS room and to the
guest's session room.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.interfaces import LoaderOption

from app.core.exceptions import (
    InvalidTokenError,
    PermissionDeniedError,
    ResourceConflictError,
    TenantNotFoundError,
)
from app.core.tenant import TenantContext
from app.core.ws_manager import ws_manager
from app.models.branch import Branch
from app.models.enums import (
    ServiceRequestStatus,
    ServiceRequestType,
    TableSessionStatus,
)
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.table_session import TableSession
from app.schemas.service_request import (
    GuestServiceRequestCreate,
    GuestServiceRequestResponse,
    ServiceRequestResponse,
)
from app.services.audit_service import record_audit_log
from app.services.branch_roaming_service import can_user_roam_branches

logger = structlog.get_logger("app.services.service_request_service")

GUEST_SESSION_STATUSES = (TableSessionStatus.ACTIVE, TableSessionStatus.BILL_REQUESTED)
"""Session states in which a guest can still raise and follow requests."""

ACTIVE_REQUEST_STATUSES = (ServiceRequestStatus.OPEN, ServiceRequestStatus.ACKNOWLEDGED)
"""Requests still waiting on staff; the default filter for the staff queue."""

GUEST_REQUEST_LIST_LIMIT = 50
"""Most requests returned to a guest; a session never legitimately needs more."""

EVENT_CREATED = "service_request.created"
EVENT_UPDATED = "service_request.updated"

_DUPLICATE_OPEN_REQUEST = (
    "You already have an open request of this type. "
    "A staff member will be with you shortly."
)
_INVALID_GUEST_SESSION = "Invalid or expired table session."
_STATUS_CONFLICT = {
    ServiceRequestStatus.OPEN: "This request is still open.",
    ServiceRequestStatus.ACKNOWLEDGED: "This request has already been acknowledged.",
    ServiceRequestStatus.RESOLVED: "This request has already been resolved.",
    ServiceRequestStatus.CANCELLED: "This request has been cancelled.",
}


# ==============================================================================
# Shared helpers
# ==============================================================================


def _staff_detail_options() -> tuple[LoaderOption, ...]:
    """Eager-load what the staff response shows: table, dining area, and staff names."""
    return (
        selectinload(ServiceRequest.table).selectinload(RestaurantTable.dining_area),
        selectinload(ServiceRequest.acknowledged_by_user),
        selectinload(ServiceRequest.resolved_by_user),
    )


def _to_guest_response(
    request: ServiceRequest, table_number: str
) -> GuestServiceRequestResponse:
    """Maps a request to the guest view, which never exposes staff identities."""
    return GuestServiceRequestResponse(
        id=request.id,
        table_id=request.table_id,
        table_number=table_number,
        request_type=request.request_type,
        note=request.note,
        status=request.status,
        created_at=request.created_at,
        acknowledged_at=request.acknowledged_at,
        resolved_at=request.resolved_at,
    )


def _to_staff_response(request: ServiceRequest) -> ServiceRequestResponse:
    """Maps a request loaded with ``_staff_detail_options`` to the staff view."""
    table = request.table
    area = table.dining_area
    acknowledged_by = request.acknowledged_by_user
    resolved_by = request.resolved_by_user
    return ServiceRequestResponse(
        id=request.id,
        business_id=request.business_id,
        branch_id=request.branch_id,
        table_id=request.table_id,
        table_session_id=request.table_session_id,
        table_number=table.table_number,
        dining_area_name_en=area.name_en if area else None,
        dining_area_name_km=area.name_km if area else None,
        request_type=request.request_type,
        note=request.note,
        status=request.status,
        created_at=request.created_at,
        acknowledged_at=request.acknowledged_at,
        acknowledged_by_user_id=request.acknowledged_by_user_id,
        acknowledged_by_name=acknowledged_by.full_name if acknowledged_by else None,
        resolved_at=request.resolved_at,
        resolved_by_user_id=request.resolved_by_user_id,
        resolved_by_name=resolved_by.full_name if resolved_by else None,
    )


async def _broadcast_service_request_event(
    event: str, request: ServiceRequest, table_number: str
) -> None:
    """
    Notifies the branch POS room and the guest's session room of a request change.

    Call only after the change is committed. The payload also reaches the guest, so
    it carries the guest view of the request and no staff identities.
    """
    payload: dict[str, Any] = _to_guest_response(request, table_number).model_dump(
        mode="json"
    )
    payload["table_session_id"] = str(request.table_session_id)
    await ws_manager.broadcast_to_rooms(
        rooms=[
            f"branch:{request.branch_id}:pos",
            f"session:{request.table_session_id}",
        ],
        event=event,
        data=payload,
        business_id=request.business_id,
        branch_id=request.branch_id,
    )


# ==============================================================================
# Guest side (authenticated by the table session token)
# ==============================================================================


async def _resolve_guest_session(
    session: AsyncSession,
    branch_id: UUID,
    table_id: UUID,
    session_token: str,
) -> tuple[TableSession, RestaurantTable]:
    """
    Returns the live session the token belongs to, with its table.

    The token must belong to an ACTIVE or BILL_REQUESTED session of the given table
    at the given branch. Unknown tokens and closed sessions are rejected alike, so
    the response does not reveal whether a token was ever valid.
    """
    result = await session.execute(
        select(TableSession, RestaurantTable)
        .join(RestaurantTable, RestaurantTable.id == TableSession.table_id)
        .where(
            TableSession.session_token == session_token,
            TableSession.table_id == table_id,
            TableSession.branch_id == branch_id,
            TableSession.status.in_(GUEST_SESSION_STATUSES),
        )
    )
    row = result.first()
    if row is None:
        logger.warning(
            "Guest service request rejected: no live table session for token",
            branch_id=str(branch_id),
            table_id=str(table_id),
        )
        raise InvalidTokenError(_INVALID_GUEST_SESSION)
    table_session, table = row._tuple()
    return table_session, table


async def _find_open_request_id(
    session: AsyncSession,
    table_session_id: UUID,
    request_type: ServiceRequestType,
) -> UUID | None:
    """Returns the ID of the session's open request of this type, if there is one."""
    result = await session.execute(
        select(ServiceRequest.id)
        .where(
            ServiceRequest.table_session_id == table_session_id,
            ServiceRequest.request_type == request_type,
            ServiceRequest.status == ServiceRequestStatus.OPEN,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_guest_service_request(
    session: AsyncSession,
    branch_id: UUID,
    table_id: UUID,
    session_token: str,
    payload: GuestServiceRequestCreate,
) -> GuestServiceRequestResponse:
    """
    Raises a new service request from the guest's live table session.

    Rejects the request with ``ResourceConflictError`` when the session already has
    an open request of the same type, so repeated taps cannot flood the staff queue.
    """
    table_session, table = await _resolve_guest_session(
        session, branch_id, table_id, session_token
    )
    # Read these now: a rollback below expires every loaded instance.
    table_session_id = table_session.id
    table_number = table.table_number

    existing_id = await _find_open_request_id(
        session, table_session_id, payload.request_type
    )
    if existing_id is not None:
        logger.warning(
            "Guest service request rejected: duplicate open request",
            table_session_id=str(table_session_id),
            request_type=payload.request_type.value,
        )
        raise ResourceConflictError(_DUPLICATE_OPEN_REQUEST)

    request = ServiceRequest(
        organization_id=table_session.organization_id,
        business_id=table_session.business_id,
        branch_id=table_session.branch_id,
        table_id=table.id,
        table_session_id=table_session_id,
        request_type=payload.request_type,
        note=payload.note,
        status=ServiceRequestStatus.OPEN,
    )
    session.add(request)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        # A concurrent submission of the same type won the partial unique index.
        existing_id = await _find_open_request_id(
            session, table_session_id, payload.request_type
        )
        if existing_id is not None:
            logger.warning(
                "Guest service request rejected: concurrent duplicate open request",
                table_session_id=str(table_session_id),
                request_type=payload.request_type.value,
            )
            raise ResourceConflictError(_DUPLICATE_OPEN_REQUEST) from exc
        raise
    await session.refresh(request)

    logger.info(
        "Guest service request created",
        service_request_id=str(request.id),
        branch_id=str(request.branch_id),
        table_id=str(request.table_id),
        request_type=request.request_type.value,
    )
    await _broadcast_service_request_event(EVENT_CREATED, request, table_number)
    return _to_guest_response(request, table_number)


async def list_guest_service_requests(
    session: AsyncSession,
    branch_id: UUID,
    table_id: UUID,
    session_token: str,
) -> list[GuestServiceRequestResponse]:
    """Lists the requests raised during the guest's own table session, newest first."""
    table_session, _ = await _resolve_guest_session(
        session, branch_id, table_id, session_token
    )
    result = await session.execute(
        select(ServiceRequest)
        .options(selectinload(ServiceRequest.table))
        .where(ServiceRequest.table_session_id == table_session.id)
        .order_by(ServiceRequest.created_at.desc())
        .limit(GUEST_REQUEST_LIST_LIMIT)
    )
    return [
        _to_guest_response(request, request.table.table_number)
        for request in result.scalars()
    ]


# ==============================================================================
# Staff side (tenant-scoped, front-of-house roles)
# ==============================================================================


async def _enforce_service_hub_access(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
) -> None:
    """
    Checks that the caller may use this branch's service request queue.

    The branch must belong to the business and to the caller's organization
    (``TenantNotFoundError`` otherwise, so other tenants cannot probe branch IDs),
    and branch-locked staff may only use their own branch (``PermissionDeniedError``).
    Which roles may change requests is enforced by the router's RBAC dependency.
    """
    branch_res = await session.execute(
        select(Branch.id).where(
            Branch.id == branch_id,
            Branch.business_id == business_id,
            Branch.organization_id == tenant.organization_id,
        )
    )
    if branch_res.scalar_one_or_none() is None:
        raise TenantNotFoundError("Branch not found.")

    membership = tenant.membership
    if not can_user_roam_branches(membership) and membership.branch_id != branch_id:
        logger.warning(
            "Service hub access denied: branch-locked staff outside own branch",
            user_id=str(tenant.user_id),
            branch_id=str(branch_id),
        )
        raise PermissionDeniedError(
            "You can only manage service requests for your own branch."
        )


async def _load_request_details(
    session: AsyncSession, request_id: UUID
) -> ServiceRequest:
    """Reloads a request from the database with everything the staff view shows."""
    result = await session.execute(
        select(ServiceRequest)
        .options(*_staff_detail_options())
        .where(ServiceRequest.id == request_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def _get_request_for_update(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    request_id: UUID,
) -> ServiceRequest:
    """
    Loads and row-locks a request of this branch so concurrent staff actions serialize.
    """
    await _enforce_service_hub_access(session, tenant, business_id, branch_id)
    result = await session.execute(
        select(ServiceRequest)
        .options(selectinload(ServiceRequest.table))
        .where(
            ServiceRequest.id == request_id,
            ServiceRequest.organization_id == tenant.organization_id,
            ServiceRequest.branch_id == branch_id,
        )
        .with_for_update()
    )
    request = result.scalar_one_or_none()
    if request is None:
        raise TenantNotFoundError("Service request not found.")
    return request


def _require_status(
    request: ServiceRequest, allowed: Sequence[ServiceRequestStatus]
) -> ServiceRequestStatus:
    """Returns the current status, or raises ``ResourceConflictError`` if not allowed."""
    current = request.status
    if current not in allowed:
        raise ResourceConflictError(_STATUS_CONFLICT[current])
    return current


async def _commit_staff_transition(
    session: AsyncSession,
    tenant: TenantContext,
    request: ServiceRequest,
    previous_status: ServiceRequestStatus,
    action: str,
) -> ServiceRequestResponse:
    """Audits and commits a staff status change, then broadcasts the new state."""
    request_id = request.id
    await record_audit_log(
        session=session,
        action=action,
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="service_request",
        resource_id=str(request_id),
        details={
            "branch_id": str(request.branch_id),
            "table_number": request.table.table_number,
            "request_type": request.request_type.value,
            "previous_status": previous_status.value,
            "new_status": request.status.value,
        },
    )
    await session.commit()

    detailed = await _load_request_details(session, request_id)
    logger.info(
        "Service request status changed",
        service_request_id=str(request_id),
        branch_id=str(detailed.branch_id),
        user_id=str(tenant.user_id),
        previous_status=previous_status.value,
        new_status=detailed.status.value,
    )
    await _broadcast_service_request_event(
        EVENT_UPDATED, detailed, detailed.table.table_number
    )
    return _to_staff_response(detailed)


async def list_branch_service_requests(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    statuses: Sequence[ServiceRequestStatus] | None = None,
    limit: int = 100,
) -> list[ServiceRequestResponse]:
    """
    Lists a branch's service requests, newest first.

    Without a status filter, returns the requests still waiting on staff (open and
    acknowledged).
    """
    await _enforce_service_hub_access(session, tenant, business_id, branch_id)
    wanted = tuple(statuses) if statuses else ACTIVE_REQUEST_STATUSES
    result = await session.execute(
        select(ServiceRequest)
        .options(*_staff_detail_options())
        .where(
            ServiceRequest.organization_id == tenant.organization_id,
            ServiceRequest.branch_id == branch_id,
            ServiceRequest.status.in_(wanted),
        )
        .order_by(ServiceRequest.created_at.desc())
        .limit(limit)
    )
    return [_to_staff_response(request) for request in result.scalars()]


async def acknowledge_service_request(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    request_id: UUID,
) -> ServiceRequestResponse:
    """Marks an open request as taken by the calling staff member."""
    request = await _get_request_for_update(
        session, tenant, business_id, branch_id, request_id
    )
    previous_status = _require_status(request, (ServiceRequestStatus.OPEN,))
    request.status = ServiceRequestStatus.ACKNOWLEDGED
    request.acknowledged_at = datetime.now(UTC)
    request.acknowledged_by_user_id = tenant.user_id
    return await _commit_staff_transition(
        session, tenant, request, previous_status, "SERVICE_REQUEST_ACKNOWLEDGED"
    )


async def resolve_service_request(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    request_id: UUID,
) -> ServiceRequestResponse:
    """
    Marks an open or acknowledged request as handled by the calling staff member.

    Resolving an open request directly leaves the acknowledgement fields empty,
    because nobody acknowledged it separately.
    """
    request = await _get_request_for_update(
        session, tenant, business_id, branch_id, request_id
    )
    previous_status = _require_status(request, ACTIVE_REQUEST_STATUSES)
    request.status = ServiceRequestStatus.RESOLVED
    request.resolved_at = datetime.now(UTC)
    request.resolved_by_user_id = tenant.user_id
    return await _commit_staff_transition(
        session, tenant, request, previous_status, "SERVICE_REQUEST_RESOLVED"
    )
