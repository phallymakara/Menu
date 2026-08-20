import io
import zipfile
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.branch import Branch
from app.models.business import Business
from app.models.dining_area import DiningArea
from app.models.enums import (
    MembershipStatus,
    OrganizationStatus,
    StaffRole,
    UserStatus,
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.restaurant_table import RestaurantTable
from app.models.user import User
from app.services.subscription_service import (
    ensure_default_plans,
    provision_trial_subscription,
)

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def setup_test_tenant(
    session,
    org_name="QR Org",
    email="qr_owner@example.com",
):
    """Helper to setup user, org, business, branch with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="QR Owner",
        status=UserStatus.ACTIVE,
        is_verified=True,
    )
    org = Organization(
        name=org_name,
        slug=f"slug-{uuid4().hex[:8]}",
        status=OrganizationStatus.ACTIVE,
        is_active=True,
    )
    session.add_all([user, org])
    await session.flush()

    mem = OrganizationMembership(
        organization_id=org.id,
        user_id=user.id,
        role=StaffRole.OWNER,
        status=MembershipStatus.ACTIVE,
        is_owner=True,
    )
    biz = Business(
        organization_id=org.id,
        name_en=f"{org_name} Cafe",
        business_type="Cafe",
        is_active=True,
    )
    session.add_all([mem, biz])
    await session.flush()

    branch = Branch(
        organization_id=org.id,
        business_id=biz.id,
        name_en="BKK1 Branch",
        code="BKK01",
        is_active=True,
    )
    session.add(branch)
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch


@pytest.mark.anyio
async def test_single_table_qr_json_png_svg():
    """Test generating single table QR in JSON, PNG, and SVG formats."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        area = DiningArea(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Terrace",
        )
        session.add(area)
        await session.flush()

        tbl = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            dining_area_id=area.id,
            table_number="T-01",
        )
        session.add(tbl)
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. JSON format
            json_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}/qr?format=json",
                headers=headers,
            )
            assert json_resp.status_code == status.HTTP_200_OK
            qr_data = json_resp.json()
            assert qr_data["table_number"] == "T-01"
            assert qr_data["qr_token"] is not None
            assert qr_data["ordering_url"].startswith("http")
            assert qr_data["qr_base64"].startswith("data:image/png;base64,")

            # 2. PNG format
            png_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}/qr?format=png",
                headers=headers,
            )
            assert png_resp.status_code == status.HTTP_200_OK
            assert png_resp.headers["content-type"] == "image/png"
            assert png_resp.content.startswith(b"\x89PNG")

            # 3. SVG format
            svg_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}/qr?format=svg",
                headers=headers,
            )
            assert svg_resp.status_code == status.HTTP_200_OK
            assert svg_resp.headers["content-type"] == "image/svg+xml"
            assert b"<svg" in svg_resp.content

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_table_qr_regeneration_and_public_verification():
    """Test regenerating a table's QR token and public guest verification."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        tbl = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="VIP-88",
        )
        session.add(tbl)
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            initial_qr = (
                await client.get(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}/qr",
                    headers=headers,
                )
            ).json()
            initial_token = initial_qr["qr_token"]

            # Public verification with initial valid token
            verify_resp = await client.get(
                f"/api/v1/public/tables/verify?branch_id={branch.id}&table_id={tbl.id}&token={initial_token}"
            )
            assert verify_resp.status_code == status.HTTP_200_OK
            assert verify_resp.json()["is_valid"] is True
            assert verify_resp.json()["table_number"] == "VIP-88"

            # Regenerate token
            regen_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}/regenerate-qr",
                headers=headers,
            )
            assert regen_resp.status_code == status.HTTP_200_OK
            new_token = regen_resp.json()["qr_token"]
            assert new_token != initial_token

            # Old token now fails
            old_verify = await client.get(
                f"/api/v1/public/tables/verify?branch_id={branch.id}&table_id={tbl.id}&token={initial_token}"
            )
            assert old_verify.status_code == status.HTTP_404_NOT_FOUND

            # New token succeeds
            new_verify = await client.get(
                f"/api/v1/public/tables/verify?branch_id={branch.id}&table_id={tbl.id}&token={new_token}"
            )
            assert new_verify.status_code == status.HTTP_200_OK
            assert new_verify.json()["is_valid"] is True

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_batch_qr_export_json_and_zip():
    """Test batch exporting QR codes as JSON and ZIP archive."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        t1 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-01",
        )
        t2 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-02",
        )
        session.add_all([t1, t2])
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Batch JSON export
            json_batch = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/qr/batch?format=json",
                headers=headers,
            )
            assert json_batch.status_code == status.HTTP_200_OK
            data = json_batch.json()
            assert data["total_count"] == 2
            assert len(data["tables"]) == 2

            # 2. Batch ZIP export
            zip_batch = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/qr/batch?format=zip",
                headers=headers,
            )
            assert zip_batch.status_code == status.HTTP_200_OK
            assert zip_batch.headers["content-type"] == "application/zip"

            # Inspect ZIP contents
            zip_file = zipfile.ZipFile(io.BytesIO(zip_batch.content))
            namelist = zip_file.namelist()
            assert "T-01_qr.png" in namelist
            assert "T-02_qr.png" in namelist

        app.dependency_overrides.clear()

    await engine.dispose()
