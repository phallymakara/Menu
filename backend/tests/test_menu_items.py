import io
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
from app.models.category import Category
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
    org_name="Menu Org",
    email="menu_owner@example.com",
):
    """Helper to setup user, org, business, branch with subscription and category."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Menu Owner",
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
        name_en=f"{org_name} Restaurant",
        business_type="Restaurant",
        is_active=True,
    )
    session.add_all([mem, biz])
    await session.flush()

    branch = Branch(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Main Branch",
        code="MAIN",
        is_active=True,
    )
    cat = Category(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Traditional Mains",
        name_km="ម្ហូបចម្បងប្រពៃណី",
        display_order=1,
        is_active=True,
    )
    session.add_all([branch, cat])
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch, cat


@pytest.mark.anyio
async def test_create_bilingual_menu_item_with_attributes_and_pricing():
    """Test creating a rich bilingual menu item with kitchen attributes and flags."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            payload = {
                "name_en": "Fish Amok",
                "name_km": "អាម៉ុកត្រី",
                "description_en": "Steamed coconut fish curry in banana leaf",
                "description_km": "អាម៉ុកត្រីដូងខ្ចីចំហុយស្លឹកចេកបែបប្រពៃណីខ្មែរ",
                "category_id": str(cat.id),
                "sku": "AMOK-001",
                "base_price": 6.50,
                "currency": "USD",
                "prep_time_minutes": 20,
                "kitchen_station": "wok",
                "is_halal": True,
                "spice_level": 2,
                "is_featured": True,
                "is_popular": True,
                "is_new": False,
            }

            resp = await client.post(
                f"/api/v1/businesses/{biz.id}/items",
                headers=headers,
                json=payload,
            )
            assert resp.status_code == status.HTTP_201_CREATED
            data = resp.json()
            assert data["name_en"] == "Fish Amok"
            assert data["name_km"] == "អាម៉ុកត្រី"
            assert Decimal(str(data["base_price"])) == Decimal("6.50")
            assert data["prep_time_minutes"] == 20
            assert data["kitchen_station"] == "wok"
            assert data["is_halal"] is True
            assert data["spice_level"] == 2
            assert data["is_featured"] is True
            assert data["sku"] == "AMOK-001"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_menu_item_filtering_dietary_spice_search():
    """Test filtering menu items by category, dietary flags, spice level, and search."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Item A: Vegetarian Green Mango Salad
            await client.post(
                f"/api/v1/businesses/{biz.id}/items",
                headers=headers,
                json={
                    "name_en": "Green Mango Salad",
                    "name_km": "ញាំស្វាយខ្ចី",
                    "category_id": str(cat.id),
                    "base_price": 4.00,
                    "is_vegetarian": True,
                    "is_vegan": True,
                    "spice_level": 1,
                    "kitchen_station": "salad",
                },
            )

            # 2. Item B: Spicy Beef Lok Lak
            await client.post(
                f"/api/v1/businesses/{biz.id}/items",
                headers=headers,
                json={
                    "name_en": "Beef Lok Lak",
                    "name_km": "ឡុកឡាក់សាច់គោ",
                    "category_id": str(cat.id),
                    "base_price": 7.50,
                    "is_popular": True,
                    "spice_level": 2,
                    "kitchen_station": "grill",
                },
            )

            # 3. Item C: Red Chicken Curry
            await client.post(
                f"/api/v1/businesses/{biz.id}/items",
                headers=headers,
                json={
                    "name_en": "Red Chicken Curry",
                    "name_km": "ការីក្រហមសាច់មាន់",
                    "category_id": str(cat.id),
                    "sku": "CURRY-RED",
                    "base_price": 6.00,
                    "is_halal": True,
                    "is_gluten_free": True,
                    "spice_level": 3,
                    "kitchen_station": "wok",
                },
            )

            # Filter: Vegetarian
            v_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/items?is_vegetarian=true",
                headers=headers,
            )
            assert v_resp.status_code == status.HTTP_200_OK
            assert v_resp.json()["total"] == 1
            assert v_resp.json()["items"][0]["name_en"] == "Green Mango Salad"

            # Filter: Spice level 2
            s_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/items?spice_level=2",
                headers=headers,
            )
            assert s_resp.status_code == status.HTTP_200_OK
            assert s_resp.json()["total"] == 1
            assert s_resp.json()["items"][0]["name_en"] == "Beef Lok Lak"

            # Search: 'CURRY'
            search_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/items?search=CURRY",
                headers=headers,
            )
            assert search_resp.status_code == status.HTTP_200_OK
            assert search_resp.json()["total"] == 1
            assert search_resp.json()["items"][0]["sku"] == "CURRY-RED"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_sku_uniqueness_validation():
    """Test that duplicate SKU within the same business is rejected."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create first item
            resp1 = await client.post(
                f"/api/v1/businesses/{biz.id}/items",
                headers=headers,
                json={
                    "name_en": "Item 1",
                    "sku": "UNIQUE-SKU",
                    "base_price": 5.00,
                },
            )
            assert resp1.status_code == status.HTTP_201_CREATED

            # 2. Duplicate SKU -> 409 Conflict
            resp2 = await client.post(
                f"/api/v1/businesses/{biz.id}/items",
                headers=headers,
                json={
                    "name_en": "Item 2",
                    "sku": "UNIQUE-SKU",
                    "base_price": 8.00,
                },
            )
            assert resp2.status_code == status.HTTP_409_CONFLICT

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_update_and_delete_menu_item():
    """Test updating and deleting menu items."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create item
            create_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/items",
                headers=headers,
                json={"name_en": "Original Dish", "base_price": 5.00},
            )
            item_id = create_resp.json()["id"]

            # 2. Patch item
            patch_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/items/{item_id}",
                headers=headers,
                json={
                    "name_en": "Renamed Dish",
                    "base_price": 6.75,
                    "is_popular": True,
                },
            )
            assert patch_resp.status_code == status.HTTP_200_OK
            assert patch_resp.json()["name_en"] == "Renamed Dish"
            assert Decimal(str(patch_resp.json()["base_price"])) == Decimal("6.75")
            assert patch_resp.json()["is_popular"] is True

            # 3. Delete item
            del_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/items/{item_id}",
                headers=headers,
            )
            assert del_resp.status_code == status.HTTP_204_NO_CONTENT

            # 4. Confirm deleted
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/items/{item_id}",
                headers=headers,
            )
            assert get_resp.status_code == status.HTTP_404_NOT_FOUND

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_media_upload_endpoint():
    """Test local image file upload endpoint."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            dummy_png = (
                b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
                b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
            )
            files = {"file": ("test_amok.png", io.BytesIO(dummy_png), "image/png")}

            upload_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/media/upload",
                headers=headers,
                files=files,
            )
            assert upload_resp.status_code == status.HTTP_201_CREATED
            data = upload_resp.json()
            assert data["url"].startswith("/uploads/menu_items/")
            assert "test_amok.png" in data["filename"]

        app.dependency_overrides.clear()

    await engine.dispose()
