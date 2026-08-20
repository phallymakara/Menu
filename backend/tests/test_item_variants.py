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
from app.models.menu_item import MenuItem
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
    org_name="Cafe Org",
    email="cafe_owner@example.com",
):
    """Helper to setup user, org, business, branch, category, item with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Cafe Owner",
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
        name_en=f"{org_name} Coffee Shop",
        business_type="Coffee Shop",
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
        name_en="Coffee & Espresso",
        name_km="កាហ្វេ និង អេសប្រេសសូ",
        display_order=1,
        is_active=True,
    )
    session.add_all([branch, cat])
    await session.flush()

    item = MenuItem(
        organization_id=org.id,
        business_id=biz.id,
        category_id=cat.id,
        sku="LATTE-01",
        name_en="Caffe Latte",
        name_km="កាហ្វេឡាតេ",
        base_price=Decimal("3.00"),
        currency="USD",
        prep_time_minutes=5,
        kitchen_station="bar",
        is_active=True,
    )
    session.add(item)
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch, cat, item


@pytest.mark.anyio
async def test_create_single_and_batch_variants():
    """Test creating individual and batch variants for size and temperature."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat, item = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Batch create size variants:
            # Regular (+0), Large (+0.75), Extra Large (+1.50)
            batch_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/variants/batch",
                headers=headers,
                json={
                    "variants": [
                        {
                            "variant_group": "Size",
                            "name_en": "Regular",
                            "name_km": "ធម្មតា",
                            "price_adjustment": 0.00,
                            "is_default": True,
                            "display_order": 1,
                        },
                        {
                            "variant_group": "Size",
                            "name_en": "Large",
                            "name_km": "ធំ",
                            "price_adjustment": 0.75,
                            "is_default": False,
                            "display_order": 2,
                        },
                        {
                            "variant_group": "Size",
                            "name_en": "Extra Large",
                            "name_km": "ធំពិសេស",
                            "price_adjustment": 1.50,
                            "is_default": False,
                            "display_order": 3,
                        },
                    ]
                },
            )
            assert batch_resp.status_code == status.HTTP_201_CREATED
            assert len(batch_resp.json()) == 3

            # 2. Create single temperature variant: Iced (+0.25)
            single_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/variants",
                headers=headers,
                json={
                    "variant_group": "Temperature",
                    "name_en": "Iced",
                    "name_km": "ទឹកកក",
                    "price_adjustment": 0.25,
                    "is_default": True,
                },
            )
            assert single_resp.status_code == status.HTTP_201_CREATED
            data = single_resp.json()
            assert data["name_en"] == "Iced"
            assert Decimal(str(data["price_adjustment"])) == Decimal("0.25")

            # 3. List all variants
            list_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/variants",
                headers=headers,
            )
            assert list_resp.status_code == status.HTTP_200_OK
            assert len(list_resp.json()) == 4

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_menu_item_detail_eager_loads_variants():
    """Test that menu item endpoints return eager-loaded nested variants."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat, item = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # Add 2 variants
            await client.post(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/variants",
                headers=headers,
                json={
                    "variant_group": "Size",
                    "name_en": "Small",
                    "price_adjustment": 0.00,
                },
            )
            await client.post(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/variants",
                headers=headers,
                json={
                    "variant_group": "Size",
                    "name_en": "Large",
                    "price_adjustment": 0.80,
                },
            )

            # Get item detail
            item_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/items/{item.id}",
                headers=headers,
            )
            assert item_resp.status_code == status.HTTP_200_OK
            item_data = item_resp.json()
            assert "variants" in item_data
            assert len(item_data["variants"]) == 2
            variant_names = [v["name_en"] for v in item_data["variants"]]
            assert "Small" in variant_names
            assert "Large" in variant_names

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_update_and_delete_variant():
    """Test updating variant fields and deleting a variant."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat, item = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create variant
            v_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/variants",
                headers=headers,
                json={
                    "variant_group": "Portion",
                    "name_en": "Single",
                    "price_adjustment": 0.00,
                },
            )
            var_id = v_resp.json()["id"]

            # 2. Patch variant
            patch_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/variants/{var_id}",
                headers=headers,
                json={"price_adjustment": 1.25, "name_en": "Double Shot"},
            )
            assert patch_resp.status_code == status.HTTP_200_OK
            assert patch_resp.json()["name_en"] == "Double Shot"
            assert Decimal(str(patch_resp.json()["price_adjustment"])) == Decimal(
                "1.25"
            )

            # 3. Delete variant
            del_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/variants/{var_id}",
                headers=headers,
            )
            assert del_resp.status_code == status.HTTP_204_NO_CONTENT

            # 4. Confirm deleted
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/variants/{var_id}",
                headers=headers,
            )
            assert get_resp.status_code == status.HTTP_404_NOT_FOUND

        app.dependency_overrides.clear()

    await engine.dispose()
