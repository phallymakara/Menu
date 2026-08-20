import io
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.schemas.restaurant_table import TableQRDetailResponse
from app.services.table_qr_service import (
    export_batch_table_qr_json,
    export_batch_table_qr_zip,
    generate_qr_image_bytes,
    get_table_qr_detail,
    regenerate_table_qr_token,
)

logger = structlog.get_logger("app.api.v1.endpoints.table_qr")

router = APIRouter(
    prefix="/businesses/{business_id}/branches/{branch_id}/tables",
    tags=["Restaurant Table QR Codes"],
)


@router.get(
    "/qr/batch",
    status_code=status.HTTP_200_OK,
)
async def export_batch_table_qr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    dining_area_id: Annotated[
        UUID | None,
        Query(description="Filter by dining area / zone ID"),
    ] = None,
    export_format: Annotated[
        str,
        Query(alias="format", description="Export format ('json' or 'zip')"),
    ] = "json",
    img_format: Annotated[
        str,
        Query(description="Image format in ZIP ('png' or 'svg')"),
    ] = "png",
    base_url: Annotated[
        str | None,
        Query(description="Custom frontend ordering base URL"),
    ] = None,
) -> Response:
    """
    Export batch table QR codes as a JSON bundle or a downloadable ZIP archive.
    """
    try:
        if export_format.lower() == "zip":
            zip_bytes, filename = await export_batch_table_qr_zip(
                session=session,
                tenant=tenant,
                business_id=business_id,
                branch_id=branch_id,
                dining_area_id=dining_area_id,
                base_url=base_url,
                format=img_format,
            )
            return StreamingResponse(
                io.BytesIO(zip_bytes),
                media_type="application/zip",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        # JSON format
        result = await export_batch_table_qr_json(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            dining_area_id=dining_area_id,
            base_url=base_url,
        )
        return Response(
            content=result.model_dump_json(),
            media_type="application/json",
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/{table_id}/qr",
    status_code=status.HTTP_200_OK,
)
async def get_table_qr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    qr_format: Annotated[
        str,
        Query(alias="format", description="Output format ('png', 'svg', or 'json')"),
    ] = "json",
    box_size: Annotated[
        int,
        Query(ge=4, le=40, description="QR code image box size"),
    ] = 10,
    download: Annotated[
        bool,
        Query(
            description="Attach Content-Disposition header to trigger browser download"
        ),
    ] = False,
    base_url: Annotated[
        str | None,
        Query(description="Custom frontend ordering base URL"),
    ] = None,
) -> Response:
    """
    Generate and retrieve the QR code for a single table in JSON, PNG, or SVG format.
    """
    try:
        detail = await get_table_qr_detail(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            table_id=table_id,
            base_url=base_url,
        )

        fmt = qr_format.lower()
        if fmt in ("png", "svg"):
            img_bytes, mime_type = generate_qr_image_bytes(
                detail.ordering_url,
                format=fmt,
                box_size=box_size,
            )
            headers = {}
            if download:
                clean_num = detail.table_number.replace("/", "-").replace(" ", "_")
                headers["Content-Disposition"] = (
                    f'attachment; filename="table_{clean_num}_qr.{fmt}"'
                )
            return Response(
                content=img_bytes,
                media_type=mime_type,
                headers=headers,
            )

        # Default JSON format
        return Response(
            content=detail.model_dump_json(),
            media_type="application/json",
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/{table_id}/regenerate-qr",
    response_model=TableQRDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def regenerate_table_qr_endpoint(
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    base_url: Annotated[
        str | None,
        Query(description="Custom frontend ordering base URL"),
    ] = None,
) -> TableQRDetailResponse:
    """
    Regenerate a table's QR verification token, invalidating old QR stickers.
    """
    try:
        return await regenerate_table_qr_token(
            session=session,
            tenant=tenant,
            business_id=business_id,
            branch_id=branch_id,
            table_id=table_id,
            base_url=base_url,
        )
    except TenantNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
