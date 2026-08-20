from __future__ import annotations

import base64
import io
import zipfile
from uuid import UUID

import qrcode
import qrcode.image.svg
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.exceptions import TenantNotFoundError
from app.core.tenant import TenantContext
from app.models.branch import Branch
from app.models.restaurant_table import RestaurantTable, generate_qr_token
from app.schemas.restaurant_table import (
    TableBatchQRExportResponse,
    TablePublicVerifyResponse,
    TableQRDetailResponse,
)
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.table_qr_service")
settings = Settings()


def generate_qr_image_bytes(
    data: str,
    format: str = "png",
    box_size: int = 10,
    border: int = 4,
) -> tuple[bytes, str]:
    """
    Renders QR code image in PNG or SVG format.
    Returns (image_bytes, mime_type).
    """
    if format.lower() == "svg":
        factory = qrcode.image.svg.SvgImage
        qr = qrcode.QRCode(
            image_factory=factory,
            box_size=box_size,
            border=border,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
        )
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image()
        buf = io.BytesIO()
        img.save(buf)
        return buf.getvalue(), "image/svg+xml"

    qr = qrcode.QRCode(
        box_size=box_size,
        border=border,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue(), "image/png"


def generate_qr_base64(data: str, box_size: int = 10) -> str:
    """
    Returns Base64 encoded PNG data URI.
    """
    png_bytes, _ = generate_qr_image_bytes(data, format="png", box_size=box_size)
    b64 = base64.b64encode(png_bytes).decode("ascii")
    return f"data:image/png;base64,{b64}"


def build_ordering_url(
    branch_id: UUID,
    table_id: UUID,
    token: str,
    base_url: str | None = None,
) -> str:
    """
    Builds the target dynamic customer web ordering link.
    """
    root = (base_url or settings.frontend_base_url).rstrip("/")
    return f"{root}/order/{branch_id}?table={table_id}&token={token}"


async def get_table_qr_detail(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    base_url: str | None = None,
) -> TableQRDetailResponse:
    """
    Retrieves full QR metadata and Base64 image for a table.
    """
    result = await session.execute(
        select(RestaurantTable)
        .options(
            selectinload(RestaurantTable.dining_area),
            selectinload(RestaurantTable.branch),
        )
        .where(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
            RestaurantTable.organization_id == tenant.organization_id,
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    if not table.qr_code_token:
        table.qr_code_token = generate_qr_token()
        await session.commit()
        await session.refresh(table)

    ordering_url = build_ordering_url(
        branch_id=branch_id,
        table_id=table.id,
        token=table.qr_code_token,
        base_url=base_url,
    )
    qr_base64 = generate_qr_base64(ordering_url)

    return TableQRDetailResponse(
        table_id=table.id,
        table_number=table.table_number,
        name=table.name,
        dining_area_name_en=table.dining_area.name_en if table.dining_area else None,
        dining_area_name_km=table.dining_area.name_km if table.dining_area else None,
        branch_id=branch_id,
        branch_name_en=table.branch.name_en if table.branch else "",
        qr_token=table.qr_code_token,
        ordering_url=ordering_url,
        qr_base64=qr_base64,
    )


async def regenerate_table_qr_token(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    table_id: UUID,
    base_url: str | None = None,
) -> TableQRDetailResponse:
    """
    Regenerates a new cryptographic token for a table, invalidating the old QR.
    """
    result = await session.execute(
        select(RestaurantTable)
        .options(
            selectinload(RestaurantTable.dining_area),
            selectinload(RestaurantTable.branch),
        )
        .where(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
            RestaurantTable.organization_id == tenant.organization_id,
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    old_token = table.qr_code_token
    table.qr_code_token = generate_qr_token()
    await session.commit()
    await session.refresh(table)

    await record_audit_log(
        session=session,
        action="TABLE_QR_REGENERATED",
        organization_id=tenant.organization_id,
        user_id=tenant.user_id,
        resource_type="table",
        resource_id=str(table_id),
        details={
            "table_number": table.table_number,
            "old_token_prefix": old_token[:8] if old_token else None,
            "new_token_prefix": table.qr_code_token[:8],
        },
    )
    await session.commit()

    logger.info(
        "Table QR token regenerated",
        table_id=str(table_id),
        number=table.table_number,
    )

    return await get_table_qr_detail(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        table_id=table_id,
        base_url=base_url,
    )


async def export_batch_table_qr_json(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    dining_area_id: UUID | None = None,
    base_url: str | None = None,
) -> TableBatchQRExportResponse:
    """
    Generates a list of all table QR codes and Base64 images for a branch or zone.
    """
    branch_res = await session.execute(
        select(Branch).where(
            Branch.id == branch_id,
            Branch.business_id == business_id,
            Branch.organization_id == tenant.organization_id,
        )
    )
    branch = branch_res.scalar_one_or_none()
    if branch is None:
        raise TenantNotFoundError("Branch not found.")

    query = (
        select(RestaurantTable)
        .options(selectinload(RestaurantTable.dining_area))
        .where(
            RestaurantTable.branch_id == branch_id,
            RestaurantTable.business_id == business_id,
            RestaurantTable.organization_id == tenant.organization_id,
            RestaurantTable.is_active.is_(True),
        )
    )
    if dining_area_id is not None:
        query = query.where(RestaurantTable.dining_area_id == dining_area_id)

    query = query.order_by(
        RestaurantTable.display_order.asc(), RestaurantTable.table_number.asc()
    )
    res = await session.execute(query)
    tables = res.scalars().all()

    qr_list: list[TableQRDetailResponse] = []
    for t in tables:
        if not t.qr_code_token:
            t.qr_code_token = generate_qr_token()
            session.add(t)

        ordering_url = build_ordering_url(
            branch_id=branch_id,
            table_id=t.id,
            token=t.qr_code_token,
            base_url=base_url,
        )
        qr_b64 = generate_qr_base64(ordering_url)
        qr_list.append(
            TableQRDetailResponse(
                table_id=t.id,
                table_number=t.table_number,
                name=t.name,
                dining_area_name_en=t.dining_area.name_en if t.dining_area else None,
                dining_area_name_km=t.dining_area.name_km if t.dining_area else None,
                branch_id=branch_id,
                branch_name_en=branch.name_en,
                qr_token=t.qr_code_token,
                ordering_url=ordering_url,
                qr_base64=qr_b64,
            )
        )

    await session.commit()

    return TableBatchQRExportResponse(
        branch_id=branch_id,
        branch_name_en=branch.name_en,
        total_count=len(qr_list),
        tables=qr_list,
    )


async def export_batch_table_qr_zip(
    session: AsyncSession,
    tenant: TenantContext,
    business_id: UUID,
    branch_id: UUID,
    dining_area_id: UUID | None = None,
    base_url: str | None = None,
    format: str = "png",
) -> tuple[bytes, str]:
    """
    Creates an in-memory ZIP archive containing individual QR images for all tables.
    """
    batch = await export_batch_table_qr_json(
        session=session,
        tenant=tenant,
        business_id=business_id,
        branch_id=branch_id,
        dining_area_id=dining_area_id,
        base_url=base_url,
    )

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for item in batch.tables:
            img_bytes, _ = generate_qr_image_bytes(item.ordering_url, format=format)
            clean_num = item.table_number.replace("/", "-").replace(" ", "_")
            file_name = f"{clean_num}_qr.{format}"
            zip_file.writestr(file_name, img_bytes)

    zip_buffer.seek(0)
    zip_filename = f"tables_qr_{batch.branch_name_en.replace(' ', '_')}.zip"
    return zip_buffer.getvalue(), zip_filename


async def verify_public_table(
    session: AsyncSession,
    branch_id: UUID,
    table_id: UUID,
    token: str,
) -> TablePublicVerifyResponse:
    """
    Validates a table verification token when a guest scans the table's QR code.
    """
    result = await session.execute(
        select(RestaurantTable)
        .options(
            selectinload(RestaurantTable.branch),
            selectinload(RestaurantTable.business),
            selectinload(RestaurantTable.dining_area),
        )
        .where(
            RestaurantTable.id == table_id,
            RestaurantTable.branch_id == branch_id,
        )
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise TenantNotFoundError("Table not found.")

    if table.qr_code_token != token:
        raise TenantNotFoundError("Invalid or expired table QR verification token.")

    branch = table.branch
    business = table.business
    ordering_url = build_ordering_url(
        branch_id=branch_id,
        table_id=table.id,
        token=token,
    )

    return TablePublicVerifyResponse(
        is_valid=table.is_active and table.status != "out_of_service",
        table_id=table.id,
        table_number=table.table_number,
        table_name=table.name,
        status=table.status,  # type: ignore[arg-type]
        dining_area_name_en=table.dining_area.name_en if table.dining_area else None,
        dining_area_name_km=table.dining_area.name_km if table.dining_area else None,
        branch_id=branch_id,
        branch_name_en=branch.name_en if branch else "",
        business_id=business.id if business else table.business_id,
        business_name_en=business.name_en if business else "",
        currency="USD",
        ordering_url=ordering_url,
    )
