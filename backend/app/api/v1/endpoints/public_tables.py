from typing import Annotated, Any
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
    leave_guest_table_session,
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
    "/sessions/leave",
    status_code=status.HTTP_200_OK,
    summary="Guest leaves view of food without ordering",
)
async def leave_public_table_session_endpoint(
    branch_id: Annotated[UUID, Query(description="Branch ID from scanned QR")],
    table_id: Annotated[UUID, Query(description="Table ID from scanned QR")],
    token: Annotated[str, Query(description="Verification token from scanned QR")],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    session_id: Annotated[UUID | None, Query(description="Optional active session ID")] = None,
) -> dict[str, str]:
    """
    Called when a guest leaves or closes the food menu view. If they have not placed
    any orders, the table status is safely transitioned back to available.
    """
    try:
        return await leave_guest_table_session(
            session=session,
            branch_id=branch_id,
            table_id=table_id,
            qr_token=token,
            session_id=session_id,
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
    payload: GuestServiceRequestCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    session_token: TableSessionToken = None,
    token: Annotated[str | None, Query(description="Verification token from scanned QR")] = None,
) -> GuestServiceRequestResponse:
    """
    Raises a service request from the guest's live table session or scanned QR.

    Works whether the table is currently in use or free. Returns 409
    when the table already has an open request of the same type.
    """
    try:
        return await create_guest_service_request(
            session=session,
            branch_id=branch_id,
            table_id=table_id,
            session_token=session_token,
            payload=payload,
            qr_token=token,
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
    session: Annotated[AsyncSession, Depends(get_db_session)],
    session_token: TableSessionToken = None,
    token: Annotated[str | None, Query(description="Verification token from scanned QR")] = None,
) -> list[GuestServiceRequestResponse]:
    """Lists the requests raised during the guest's own table session, newest first."""
    try:
        return await list_guest_service_requests(
            session=session,
            branch_id=branch_id,
            table_id=table_id,
            session_token=session_token,
            qr_token=token,
        )
    except InvalidTokenError as exc:
        raise _invalid_guest_session(exc) from exc



@router.get(
    "/catalog",
    status_code=status.HTTP_200_OK,
    summary="Guest retrieves public menu catalog for a table",
)
async def get_public_table_catalog_endpoint(
    branch_id: Annotated[UUID, Query(description="Branch ID from scanned QR")],
    table_id: Annotated[UUID, Query(description="Table ID from scanned QR")],
    token: Annotated[str, Query(description="Verification token from scanned QR")],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> dict[str, Any]:
    """
    Public guest endpoint: retrieves active categories and menu items for the table.
    Requires no staff login credentials; verified via table QR token.
    """
    from sqlalchemy import or_, select
    from sqlalchemy.orm import selectinload
    from app.models.category import Category
    from app.models.menu_item import MenuItem
    from app.models.modifier import MenuItemModifierGroup, ModifierGroup, ModifierOption
    from app.services.table_session_service import _get_guest_table

    try:
        table = await _get_guest_table(session, branch_id, table_id, token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    cat_stmt = (
        select(Category)
        .where(
            Category.business_id == table.business_id,
            Category.is_active.is_(True),
            or_(Category.branch_id.is_(None), Category.branch_id == branch_id),
        )
        .order_by(Category.display_order.asc(), Category.created_at.asc())
    )
    cat_res = await session.execute(cat_stmt)
    categories = cat_res.scalars().all()

    item_stmt = (
        select(MenuItem)
        .options(
            selectinload(MenuItem.variants),
            selectinload(MenuItem.modifier_group_links)
            .selectinload(MenuItemModifierGroup.group)
            .selectinload(ModifierGroup.options),
        )
        .where(
            MenuItem.business_id == table.business_id,
            MenuItem.is_active.is_(True),
            or_(MenuItem.branch_id.is_(None), MenuItem.branch_id == branch_id),
        )
        .order_by(MenuItem.display_order.asc(), MenuItem.created_at.asc())
    )
    item_res = await session.execute(item_stmt)
    items = item_res.scalars().all()

    return {
        "categories": [
            {
                "id": str(c.id),
                "name_en": c.name_en,
                "name_km": c.name_km or c.name_en,
                "display_order": c.display_order,
                "is_active": c.is_active,
            }
            for c in categories
        ],
        "items": [
            {
                "id": str(it.id),
                "category_id": str(it.category_id) if it.category_id else None,
                "name_en": it.name_en,
                "name_km": it.name_km or it.name_en,
                "description_en": it.description_en or "",
                "description_km": it.description_km or "",
                "base_price": float(it.base_price),
                "base_price_usd": float(it.base_price),
                "currency": it.currency,
                "image_url": it.image_url,
                "is_available": it.is_active,
                "spicy_level": it.spice_level,
                "is_popular": it.is_popular,
                "is_vegetarian": it.is_vegetarian,
                "variants": [
                    {
                        "id": str(v.id),
                        "name_en": v.name_en,
                        "name_km": v.name_km or v.name_en,
                        "price_usd": float(v.price) if getattr(v, "price", None) is not None else float(it.base_price),
                    }
                    for v in (it.variants or [])
                    if getattr(v, "is_active", True)
                ],
                "modifier_groups": [
                    {
                        "id": str(link.group.id),
                        "name_en": link.group.name_en,
                        "name_km": link.group.name_km or link.group.name_en,
                        "selection_type": "SINGLE" if link.group.max_selections == 1 else "MULTI",
                        "min_selections": link.group.min_selections,
                        "max_selections": link.group.max_selections,
                        "is_required": link.group.min_selections > 0,
                        "options": [
                            {
                                "id": str(opt.id),
                                "name_en": opt.name_en,
                                "name_km": opt.name_km or opt.name_en,
                                "price_adjustment_usd": float(opt.price),
                                "price_usd": float(opt.price),
                                "is_default": opt.is_default,
                            }
                            for opt in (link.group.options or [])
                            if opt.is_active
                        ],
                    }
                    for link in (it.modifier_group_links or [])
                    if link.group and link.group.is_active
                ],
            }
            for it in items
        ],
        "store": {
            "name_en": table.business.name_en if table.business else None,
            "name_km": table.business.name_km if table.business else None,
            "logo_url": table.business.logo_url if table.business else None,
        },
    }
