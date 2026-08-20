from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import TenantNotFoundError
from app.db.session import get_db_session
from app.schemas.restaurant_table import TablePublicVerifyResponse
from app.schemas.table_session import (
    TableSessionOpenRequest,
    TableSessionResponse,
)
from app.services.table_qr_service import verify_public_table
from app.services.table_session_service import (
    open_table_session,
    request_session_bill,
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
    # Verify QR token first
    verified = await verify_public_table_endpoint(
        branch_id=branch_id,
        table_id=table_id,
        token=token,
        session=session,
    )
    try:
        return await open_table_session(
            session=session,
            business_id=verified.business_id,
            branch_id=branch_id,
            table_id=table_id,
            payload=payload,
            opened_by_type="guest",
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
    verified = await verify_public_table_endpoint(
        branch_id=branch_id,
        table_id=table_id,
        token=token,
        session=session,
    )
    try:
        return await request_session_bill(
            session=session,
            business_id=verified.business_id,
            branch_id=branch_id,
            table_id=table_id,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
