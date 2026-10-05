import io
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import structlog
from anyio import CapacityLimiter, to_thread
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
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
# Stored images are scaled down to fit in this box (also keeps menus light on mobile).
MAX_DIMENSION = 2048
# Largest decoded frame accepted, after JPEG draft decoding (about 5000 x 5000).
MAX_SOURCE_PIXELS = 25_000_000
# Animated GIFs keep their frames, so their total decoded size is capped too.
MAX_ANIMATION_FRAMES = 100
MAX_ANIMATION_PIXELS = 50_000_000
# Image decoding is CPU and memory heavy; bound how many uploads decode at once.
_IMAGE_DECODE_LIMITER = CapacityLimiter(2)

# Pillow format name -> (MIME type, file extension) of the stored file.
_IMAGE_FORMATS = {
    "JPEG": ("image/jpeg", ".jpg"),
    "PNG": ("image/png", ".png"),
    "WEBP": ("image/webp", ".webp"),
    "GIF": ("image/gif", ".gif"),
    "AVIF": ("image/avif", ".avif"),
}


class InvalidImageError(ValueError):
    """Raised when an upload is not a supported, decodable raster image."""


def _count_frames_up_to(image: Image.Image, limit: int) -> int:
    """
    Counts animation frames by seeking, stopping once the count exceeds ``limit``.

    Seeking decodes frames one by one, so stopping early keeps the cost bounded for
    files that pack a huge number of tiny frames.
    """
    frames = 1
    try:
        while frames <= limit:
            image.seek(frames)
            frames += 1
    except EOFError:
        pass
    finally:
        image.seek(0)
    return frames


def _reencode_image(contents: bytes) -> tuple[bytes, str, str]:
    """
    Verifies that the upload is a supported raster image and re-encodes it.

    The stored file is produced by Pillow from the decoded pixels, so metadata and
    anything appended to or hidden in the original bytes (HTML, scripts, polyglot
    payloads) are dropped. The type comes from the decoded data, never from the
    client's declared content type or file name.

    Work is bounded: sizes are checked from the header before decoding, JPEGs are
    decoded at a reduced scale, still images are scaled down to ``MAX_DIMENSION``,
    and only GIF animations keep their frames, within frame and pixel limits. Other
    animated formats keep their first frame.

    Returns:
        A tuple of (image bytes, MIME type, file extension).
    """
    try:
        with Image.open(io.BytesIO(contents)) as probe:
            image_format = probe.format
            probe.verify()
        if image_format not in _IMAGE_FORMATS:
            raise InvalidImageError(f"Unsupported image format: {image_format}.")

        with Image.open(io.BytesIO(contents)) as image:
            animated_gif = image_format == "GIF" and getattr(
                image, "is_animated", False
            )
            if animated_gif:
                width, height = image.size
                frames = _count_frames_up_to(image, MAX_ANIMATION_FRAMES)
                if (
                    frames > MAX_ANIMATION_FRAMES
                    or max(width, height) > MAX_DIMENSION
                    or frames * width * height > MAX_ANIMATION_PIXELS
                ):
                    raise InvalidImageError("Animated image is too large.")
                buffer = io.BytesIO()
                image.save(buffer, format=image_format, save_all=True)
            else:
                # For JPEG, decode directly at a smaller scale when the photo is large.
                image.draft("RGB", (MAX_DIMENSION, MAX_DIMENSION))
                width, height = image.size
                if width * height > MAX_SOURCE_PIXELS:
                    raise InvalidImageError("Image dimensions are too large.")
                image.load()
                output_image: Image.Image = image
                if image_format == "JPEG" and image.mode not in ("RGB", "L"):
                    output_image = image.convert("RGB")
                output_image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))
                buffer = io.BytesIO()
                output_image.save(buffer, format=image_format)
    except InvalidImageError:
        raise
    except Image.DecompressionBombError as exc:
        raise InvalidImageError("Image dimensions are too large.") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise InvalidImageError("The file is not a valid image.") from exc

    mime_type, extension = _IMAGE_FORMATS[image_format]
    return buffer.getvalue(), mime_type, extension


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

    # Read at most one byte past the limit instead of buffering arbitrarily large bodies.
    contents = await file.read(MAX_FILE_SIZE + 1)
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 5MB limit.",
        )

    try:
        image_bytes, mime_type, extension = await to_thread.run_sync(
            _reencode_image, contents, limiter=_IMAGE_DECODE_LIMITER
        )
    except InvalidImageError as exc:
        logger.warning(
            "Rejected media upload",
            business_id=str(business_id),
            declared_type=file.content_type,
            reason=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # Generated names only (never the client's), stored per organization and business.
    unique_filename = f"{uuid4().hex}{extension}"
    relative_dir = Path(str(tenant.organization_id)) / str(business_id)
    target_dir = UPLOAD_DIR / relative_dir
    target_path = target_dir / unique_filename

    def _write() -> None:
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(image_bytes)

    await to_thread.run_sync(_write)

    relative_url = f"/uploads/menu_items/{relative_dir.as_posix()}/{unique_filename}"

    logger.info(
        "Media image uploaded",
        business_id=str(business_id),
        filename=unique_filename,
        content_type=mime_type,
        size_bytes=len(image_bytes),
    )

    return MediaUploadResponse(
        url=relative_url,
        filename=unique_filename,
        content_type=mime_type,
        size_bytes=len(image_bytes),
    )
