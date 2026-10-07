from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.guest_session import TableSessionToken
from app.core.exceptions import (
    InvalidTokenError,
    PermissionDeniedError,
    ResourceConflictError,
    TenantInactiveError,
    TenantNotFoundError,
)
from app.db.session import get_db_session
from app.schemas.billing import BillSummaryResponse
from app.schemas.order import (
    GuestOrderPlacementRequest,
    OrderResponse,
    TableSessionOrdersSummaryResponse,
)
from app.schemas.restaurant_table import TablePublicVerifyResponse
from app.schemas.service_request import (
    GuestServiceRequestCreate,
    GuestServiceRequestResponse,
)
from app.schemas.table_session import (
    TableSessionOpenRequest,
    TableSessionResponse,
)
from app.services.order_placement_service import place_guest_order
from app.services.service_request_service import (
    create_guest_service_request,
    list_guest_service_requests,
)
from app.services.table_qr_service import verify_public_table
from app.services.table_session_service import (
    open_guest_table_session,
    request_guest_session_bill,
)

logger = structlog.get_logger("app.api.v1.endpoints.public_tables")

router = APIRouter(
    prefix="/public/tables",
    tags=["Public Table QR Verification"],
)


@router.get(
    "/verify",
    response_model=TablePublicVerifyResponse,
    status_code=status.HTTP_200_OK,
)
async def verify_public_table_endpoint(
    branch_id: Annotated[UUID, Query(description="Branch ID from scanned QR")],
    table_id: Annotated[UUID, Query(description="Table ID from scanned QR")],
    token: Annotated[str, Query(description="Verification token from scanned QR")],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TablePublicVerifyResponse:
    """
    Public verification endpoint called when customer scans table QR code.
    Validates cryptographic token and returns table and branch dining context.
    """
    try:
        return await verify_public_table(
            session=session,
            branch_id=branch_id,
            table_id=table_id,
            token=token,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/sessions/open",
    response_model=TableSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def open_public_table_session_endpoint(
    branch_id: Annotated[UUID, Query(description="Branch ID from scanned QR")],
    table_id: Annotated[UUID, Query(description="Table ID from scanned QR")],
    token: Annotated[str, Query(description="Verification token from scanned QR")],
    payload: TableSessionOpenRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionResponse:
    """
    Guest self-opens or connects to the table session upon scanning the QR code.
    """
    try:
        return await open_guest_table_session(
            session=session,
            branch_id=branch_id,
            table_id=table_id,
            qr_token=token,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/sessions/request-bill",
    response_model=TableSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def request_public_table_bill_endpoint(
    branch_id: Annotated[UUID, Query(description="Branch ID from scanned QR")],
    table_id: Annotated[UUID, Query(description="Table ID from scanned QR")],
    token: Annotated[str, Query(description="Verification token from scanned QR")],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionResponse:
    """
    Guest requests bill directly from their phone.
    """
    try:
        return await request_guest_session_bill(
            session=session,
            branch_id=branch_id,
            table_id=table_id,
            qr_token=token,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/orders",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Guest places multi-round order from table QR",
)
async def place_public_guest_order_endpoint(
    branch_id: Annotated[UUID, Query(description="Branch ID from scanned QR")],
    table_id: Annotated[UUID, Query(description="Table ID from scanned QR")],
    token: Annotated[str, Query(description="Verification token from scanned QR")],
    payload: GuestOrderPlacementRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OrderResponse:
    """
    Guest places order directly from mobile phone at table.

    The token must be the table's QR token or its active session token, and is
    checked before a dining session is opened. Inactive tables, branches,
    businesses, and organizations do not accept orders.
    """
    try:
        order = await place_guest_order(
            session=session,
            branch_id=branch_id,
            table_id=table_id,
            token=token,
            payload=payload,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except (PermissionDeniedError, TenantInactiveError) as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    return OrderResponse.model_validate(order)


@router.get(
    "/sessions/orders",
    response_model=TableSessionOrdersSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Guest views all orders & active bill total for table session",
)
async def get_public_table_session_orders_endpoint(
    branch_id: Annotated[UUID, Query(description="Branch ID from scanned QR")],
    table_id: Annotated[UUID, Query(description="Table ID from scanned QR")],
    token: Annotated[str, Query(description="Verification token from scanned QR")],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TableSessionOrdersSummaryResponse:
    """Retrieves all placed orders and live totals for the active table session."""
    from app.services.order_placement_service import get_table_session_orders_summary

    return await get_table_session_orders_summary(
        session=session,
        branch_id=branch_id,
        table_id=table_id,
        token=token,
    )


@router.get(
    "/sessions/{session_token}/bill",
    response_model=BillSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Guest views consolidated running bill for active table session",
)
async def get_public_table_session_bill_endpoint(
    session_token: str,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BillSummaryResponse:
    """
    Public guest endpoint: retrieves real-time multi-round bill calculation in USD and KHR.
    """
    from app.services.billing_service import get_public_session_bill_summary

    return await get_public_session_bill_summary(
        session=session,
        session_token=session_token,
    )


def _invalid_guest_session(exc: InvalidTokenError) -> HTTPException:
    """Maps a rejected table session token to 401, matching the missing-header error."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=str(exc),
        headers={"WWW-Authenticate": "APIKey"},
    )


@router.post(
    "/service-requests",
    response_model=GuestServiceRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Guest asks staff for help from the table (call staff, water, bill, ...)",
)
async def create_public_service_request_endpoint(
    branch_id: Annotated[UUID, Query(description="Branch ID from scanned QR")],
    table_id: Annotated[UUID, Query(description="Table ID from scanned QR")],
    session_token: TableSessionToken,
    payload: GuestServiceRequestCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> GuestServiceRequestResponse:
    """
    Raises a service request from the guest's live table session.

    Only an active or bill-requested session of this table can be used. Returns 409
    when the session already has an open request of the same type.
    """
    try:
        return await create_guest_service_request(
            session=session,
            branch_id=branch_id,
            table_id=table_id,
            session_token=session_token,
            payload=payload,
        )
    except InvalidTokenError as exc:
        raise _invalid_guest_session(exc) from exc
    except ResourceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.get(
    "/service-requests",
    response_model=list[GuestServiceRequestResponse],
    status_code=status.HTTP_200_OK,
    summary="Guest views the service requests of their own table session",
)
async def list_public_service_requests_endpoint(
    branch_id: Annotated[UUID, Query(description="Branch ID from scanned QR")],
    table_id: Annotated[UUID, Query(description="Table ID from scanned QR")],
    session_token: TableSessionToken,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[GuestServiceRequestResponse]:
    """Lists the requests raised during the guest's own table session, newest first."""
    try:
        return await list_guest_service_requests(
            session=session,
            branch_id=branch_id,
            table_id=table_id,
            session_token=session_token,
        )
    except InvalidTokenError as exc:
        raise _invalid_guest_session(exc) from exc
