"""Regression tests: uploads must be real images, re-encoded, and served inertly."""

import io
import shutil
from pathlib import Path

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
UPLOAD_ROOT = Path("uploads/menu_items")


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), (10, 120, 60)).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
async def upload_client():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, _ = await setup_test_tenant(session)

    async def _override_db():
        async with sessionmaker() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield {
            "client": client,
            "url": f"/api/v1/businesses/{biz.id}/media/upload",
            "headers": {"Authorization": f"Bearer {create_access_token(owner.id)}"},
            "org_id": org.id,
            "biz_id": biz.id,
        }
    app.dependency_overrides.clear()
    shutil.rmtree(UPLOAD_ROOT / str(org.id), ignore_errors=True)
    await engine.dispose()


async def _upload(ctx, filename: str, data: bytes, content_type: str):
    return await ctx["client"].post(
        ctx["url"],
        headers=ctx["headers"],
        files={"file": (filename, io.BytesIO(data), content_type)},
    )


@pytest.mark.anyio
async def test_valid_image_is_reencoded_into_the_tenant_folder(upload_client):
    res = await _upload(upload_client, "dish.png", _png_bytes(), "image/png")

    assert res.status_code == status.HTTP_201_CREATED
    body = res.json()
    prefix = f"/uploads/menu_items/{upload_client['org_id']}/{upload_client['biz_id']}/"
    assert body["url"].startswith(prefix)
    assert body["url"].endswith(".png")
    assert "dish" not in body["filename"]

    stored = Path(body["url"].lstrip("/"))
    with Image.open(stored) as image:
        assert image.format == "PNG"


@pytest.mark.anyio
async def test_html_disguised_as_an_image_is_rejected(upload_client):
    payload = (
        b"<html><script>fetch('/steal?t='+localStorage.emenu_access_token)</script>"
    )
    res = await _upload(upload_client, "menu.html", payload, "image/png")
    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.anyio
async def test_svg_is_rejected_even_when_declared_as_png(upload_client):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    declared_svg = await _upload(upload_client, "logo.svg", svg, "image/svg+xml")
    assert declared_svg.status_code == status.HTTP_400_BAD_REQUEST

    disguised = await _upload(upload_client, "logo.png", svg, "image/png")
    assert disguised.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.anyio
async def test_payload_appended_to_a_real_image_is_stripped(upload_client):
    polyglot = _png_bytes() + b"<script>alert(document.domain)</script>"
    res = await _upload(upload_client, "dish.png", polyglot, "image/png")

    assert res.status_code == status.HTTP_201_CREATED
    stored = Path(res.json()["url"].lstrip("/")).read_bytes()
    assert b"<script>" not in stored


@pytest.mark.anyio
async def test_oversized_upload_is_rejected(upload_client):
    oversized = _png_bytes() + b"\0" * (5 * 1024 * 1024)
    res = await _upload(upload_client, "big.png", oversized, "image/png")
    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.anyio
async def test_uploads_are_served_with_inert_content_headers(upload_client):
    res = await _upload(upload_client, "dish.png", _png_bytes(), "image/png")
    served = await upload_client["client"].get(res.json()["url"])

    assert served.status_code == status.HTTP_200_OK
    assert served.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in served.headers["content-security-policy"]


def _gif_bytes(frames: int, size: tuple[int, int] = (8, 8)) -> bytes:
    # Distinct colours: Pillow merges identical consecutive frames when saving.
    images = [
        Image.new("RGB", size, (i % 256, (i * 7) % 256, (i * 13) % 256))
        for i in range(frames)
    ]
    buffer = io.BytesIO()
    images[0].save(buffer, format="GIF", save_all=True, append_images=images[1:])
    return buffer.getvalue()


@pytest.mark.anyio
async def test_animation_with_too_many_frames_is_rejected(upload_client):
    res = await _upload(upload_client, "spin.gif", _gif_bytes(150), "image/gif")
    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.anyio
async def test_small_animation_keeps_its_frames(upload_client):
    res = await _upload(upload_client, "spin.gif", _gif_bytes(5), "image/gif")

    assert res.status_code == status.HTTP_201_CREATED
    with Image.open(Path(res.json()["url"].lstrip("/"))) as stored:
        assert getattr(stored, "n_frames", 1) == 5


@pytest.mark.anyio
async def test_large_photo_is_scaled_down(upload_client):
    buffer = io.BytesIO()
    Image.new("RGB", (3000, 2000), (90, 90, 90)).save(buffer, format="PNG")
    res = await _upload(upload_client, "huge.png", buffer.getvalue(), "image/png")

    assert res.status_code == status.HTTP_201_CREATED
    with Image.open(Path(res.json()["url"].lstrip("/"))) as stored:
        assert max(stored.size) == 2048
