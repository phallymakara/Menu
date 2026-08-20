from decimal import Decimal
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
from app.models.enums import (
    MembershipStatus,
    OrganizationStatus,
    StaffRole,
    UserStatus,
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
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
    org_name="Dining Org",
    email="dining_owner@example.com",
):
    """Helper to setup user, org, business, branch with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Dining Owner",
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
        name_en=f"{org_name} Fine Dining",
        business_type="Restaurant",
        is_active=True,
    )
    session.add_all([mem, biz])
    await session.flush()

    branch = Branch(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Riverside Flagship",
        code="RS01",
        is_active=True,
    )
    session.add(branch)
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch


@pytest.mark.anyio
async def test_create_and_list_bilingual_dining_areas_with_rules():
    """Test creating dining areas with bilingual details, minimum spend, and listing."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create Main Hall
            main_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas",
                headers=headers,
                json={
                    "name_en": "Main Dining Hall",
                    "name_km": "សាលទទួលទានធំ",
                    "display_order": 1,
                },
            )
            assert main_resp.status_code == status.HTTP_201_CREATED

            # 2. Create VIP Room 1 with Minimum Spend & Service Charge override
            vip_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas",
                headers=headers,
                json={
                    "name_en": "VIP Private Room 1",
                    "name_km": "បន្ទប់ VIP 1",
                    "description_en": "Private soundproof room with dedicated staff",
                    "minimum_spend": 50.00,
                    "service_charge_percentage": 10.00,
                    "display_order": 2,
                },
            )
            assert vip_resp.status_code == status.HTTP_201_CREATED
            vip_data = vip_resp.json()
            assert Decimal(str(vip_data["minimum_spend"])) == Decimal("50.00")
            assert Decimal(str(vip_data["service_charge_percentage"])) == Decimal(
                "10.00"
            )

            # 3. Create Outdoor Terrace
            terrace_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas",
                headers=headers,
                json={
                    "name_en": "Outdoor Terrace",
                    "name_km": "រានហាលក្រៅ",
                    "display_order": 3,
                },
            )
            assert terrace_resp.status_code == status.HTTP_201_CREATED

            # 4. List all areas
            list_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas",
                headers=headers,
            )
            assert list_resp.status_code == status.HTTP_200_OK
            areas = list_resp.json()
            assert len(areas) == 3
            assert areas[0]["name_en"] == "Main Dining Hall"
            assert areas[1]["name_en"] == "VIP Private Room 1"
            assert areas[2]["name_en"] == "Outdoor Terrace"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_update_and_reorder_dining_areas():
    """Test updating zone details and batch reordering."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            a1 = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas",
                    headers=headers,
                    json={"name_en": "Zone A", "display_order": 1},
                )
            ).json()
            a2 = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas",
                    headers=headers,
                    json={"name_en": "Zone B", "display_order": 2},
                )
            ).json()

            # Update Zone A
            patch_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas/{a1['id']}",
                headers=headers,
                json={"name_en": "Zone Alpha", "minimum_spend": 25.00},
            )
            assert patch_resp.status_code == status.HTTP_200_OK
            assert patch_resp.json()["name_en"] == "Zone Alpha"
            assert Decimal(str(patch_resp.json()["minimum_spend"])) == Decimal("25.00")

            # Reorder: Zone B first, Zone A second
            reorder_resp = await client.put(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas/reorder",
                headers=headers,
                json={"area_ids": [a2["id"], a1["id"]]},
            )
            assert reorder_resp.status_code == status.HTTP_200_OK
            reordered = reorder_resp.json()
            assert reordered[0]["id"] == a2["id"]
            assert reordered[1]["id"] == a1["id"]

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_delete_dining_area():
    """Test deleting a dining area."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            a = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas",
                    headers=headers,
                    json={"name_en": "Temporary Zone"},
                )
            ).json()

            del_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas/{a['id']}",
                headers=headers,
            )
            assert del_resp.status_code == status.HTTP_204_NO_CONTENT

            # Verify 404
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/areas/{a['id']}",
                headers=headers,
            )
            assert get_resp.status_code == status.HTTP_404_NOT_FOUND

        app.dependency_overrides.clear()

    await engine.dispose()
