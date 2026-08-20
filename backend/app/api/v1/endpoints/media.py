import re
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.db.session import get_db_session
from app.models.business import Business

logger = structlog.get_logger("app.api.v1.endpoints.media")

router = APIRouter(
    prefix="/businesses/{business_id}/media",
    tags=["Media & Image Uploads"],
)

UPLOAD_DIR = Path("uploads/menu_items")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


class MediaUploadResponse(BaseModel):
    """Response schema for uploaded media."""

    url: str
    filename: str
    content_type: str
    size_bytes: int


@router.post(
    "/upload",
    response_model=MediaUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_menu_image(
    business_id: UUID,
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    file: Annotated[UploadFile, File(description="Image file to upload")],
) -> MediaUploadResponse:
    """
    Upload a local menu item or category image.
    """
    # Verify business ownership
    biz_res = await session.execute(
        select(Business.id).where(
            Business.id == business_id,
            Business.organization_id == tenant.organization_id,
        )
    )
    if biz_res.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found.",
        )

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        allowed_str = "JPEG, PNG, WebP, GIF, AVIF"
        msg = f"Unsupported file type: {file.content_type}. Allowed: {allowed_str}."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 5MB limit.",
        )

    # Sanitize filename and generate unique name
    raw_name = file.filename or "image.jpg"
    clean_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", raw_name)
    unique_filename = f"{uuid4().hex[:12]}_{clean_name}"
    target_path = UPLOAD_DIR / unique_filename

    with open(target_path, "wb") as f:
        f.write(contents)

    relative_url = f"/uploads/menu_items/{unique_filename}"

    logger.info(
        "Media image uploaded",
        business_id=str(business_id),
        filename=unique_filename,
        size_bytes=len(contents),
    )

    return MediaUploadResponse(
        url=relative_url,
        filename=unique_filename,
        content_type=file.content_type,
        size_bytes=len(contents),
    )
