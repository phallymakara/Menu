from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.receipt import ReceiptData
from app.services.receipt_service import (
    build_order_precheck_receipt_data,
    build_payment_receipt_data,
    build_session_precheck_receipt_data,
    render_html_receipt,
    render_text_receipt,
)

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}",
    tags=["Receipt Output Engine"],
)


@router.get(
    "/payments/{payment_id}/receipt",
    summary="Get official payment receipt in HTML, text, or JSON format",
)
async def get_payment_receipt_endpoint(
    business_id: UUID,
    branch_id: UUID,
    payment_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    format: Literal["html", "text", "json"] = Query(
        default="html", description="Output format: 'html' (printable), 'text' (ESC/POS), or 'json'"
    ),
    width: Literal["80mm", "58mm"] = Query(
        default="80mm", description="Thermal roll width: '80mm' or '58mm'"
    ),
    lang: Literal["km", "en", "bilingual"] = Query(
        default="bilingual",
        description="Dynamic language selection: 'km' (Khmer), 'en' (English), or 'bilingual'",
    ),
) -> Response:
    """
    Renders an official payment sales receipt in HTML, Monospace ESC/POS text, or structured JSON.
    Supports dynamic language selection (Khmer, English, or Bilingual).
    """
    receipt_data = await build_payment_receipt_data(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        payment_id=payment_id,
        tenant=tenant,
    )

    if format == "json":
        return Response(
            content=receipt_data.model_dump_json(),
            media_type="application/json",
            status_code=status.HTTP_200_OK,
        )
    elif format == "text":
        cols = 42 if width == "80mm" else 32
        text_content = render_text_receipt(receipt_data, width_cols=cols, lang=lang)
        return PlainTextResponse(content=text_content, status_code=status.HTTP_200_OK)
    else:  # html
        html_content = render_html_receipt(receipt_data, width=width, lang=lang)
        return HTMLResponse(content=html_content, status_code=status.HTTP_200_OK)


@router.get(
    "/table-sessions/{session_id}/pre-check",
    summary="Get pre-check bill slip for dining session in HTML, text, or JSON format",
)
async def get_session_precheck_endpoint(
    business_id: UUID,
    branch_id: UUID,
    session_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    format: Literal["html", "text", "json"] = Query(
        default="html", description="Output format: 'html' (printable), 'text' (ESC/POS), or 'json'"
    ),
    width: Literal["80mm", "58mm"] = Query(
        default="80mm", description="Thermal roll width: '80mm' or '58mm'"
    ),
    lang: Literal["km", "en", "bilingual"] = Query(
        default="bilingual",
        description="Dynamic language selection: 'km' (Khmer), 'en' (English), or 'bilingual'",
    ),
) -> Response:
    """
    Renders a pro-forma pre-check guest check slip before payment for customer review.
    """
    receipt_data = await build_session_precheck_receipt_data(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        table_session_id=session_id,
        current_user=current_user,
        tenant=tenant,
    )

    if format == "json":
        return Response(
            content=receipt_data.model_dump_json(),
            media_type="application/json",
            status_code=status.HTTP_200_OK,
        )
    elif format == "text":
        cols = 42 if width == "80mm" else 32
        text_content = render_text_receipt(receipt_data, width_cols=cols, lang=lang)
        return PlainTextResponse(content=text_content, status_code=status.HTTP_200_OK)
    else:  # html
        html_content = render_html_receipt(receipt_data, width=width, lang=lang)
        return HTMLResponse(content=html_content, status_code=status.HTTP_200_OK)


@router.get(
    "/orders/{order_id}/pre-check",
    summary="Get pre-check bill slip for standalone order in HTML, text, or JSON format",
)
async def get_order_precheck_endpoint(
    business_id: UUID,
    branch_id: UUID,
    order_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    format: Literal["html", "text", "json"] = Query(
        default="html", description="Output format: 'html' (printable), 'text' (ESC/POS), or 'json'"
    ),
    width: Literal["80mm", "58mm"] = Query(
        default="80mm", description="Thermal roll width: '80mm' or '58mm'"
    ),
    lang: Literal["km", "en", "bilingual"] = Query(
        default="bilingual",
        description="Dynamic language selection: 'km' (Khmer), 'en' (English), or 'bilingual'",
    ),
) -> Response:
    """
    Renders a pro-forma pre-check guest slip for standalone takeaway orders.
    """
    receipt_data = await build_order_precheck_receipt_data(
        session=session,
        business_id=business_id,
        branch_id=branch_id,
        order_id=order_id,
        current_user=current_user,
        tenant=tenant,
    )

    if format == "json":
        return Response(
            content=receipt_data.model_dump_json(),
            media_type="application/json",
            status_code=status.HTTP_200_OK,
        )
    elif format == "text":
        cols = 42 if width == "80mm" else 32
        text_content = render_text_receipt(receipt_data, width_cols=cols, lang=lang)
        return PlainTextResponse(content=text_content, status_code=status.HTTP_200_OK)
    else:  # html
        html_content = render_html_receipt(receipt_data, width=width, lang=lang)
        return HTMLResponse(content=html_content, status_code=status.HTTP_200_OK)
