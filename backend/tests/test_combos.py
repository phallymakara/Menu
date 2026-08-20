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
    org_name="Combo Org",
    email="combo_owner@example.com",
):
    """Helper to setup user, org, business, branch, category, item with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Combo Owner",
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
        name_en=f"{org_name} Diner",
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
        name_en="Combos & Sets",
        name_km="ឈុតអាហារ",
        display_order=1,
        is_active=True,
    )
    session.add_all([branch, cat])
    await session.flush()

    # Create several items to bundle
    item_main1 = MenuItem(
        organization_id=org.id,
        business_id=biz.id,
        category_id=cat.id,
        sku="BURGER-01",
        name_en="Classic Cheeseburger",
        name_km="ប៊ឺហ្គឺរសាច់គោ",
        base_price=Decimal("4.00"),
        currency="USD",
        prep_time_minutes=10,
        kitchen_station="grill",
        is_active=True,
    )
    item_main2 = MenuItem(
        organization_id=org.id,
        business_id=biz.id,
        category_id=cat.id,
        sku="STEAK-01",
        name_en="Sirloin Steak",
        name_km="សាច់គោអាំង",
        base_price=Decimal("9.00"),
        currency="USD",
        prep_time_minutes=15,
        kitchen_station="grill",
        is_active=True,
    )
    item_side = MenuItem(
        organization_id=org.id,
        business_id=biz.id,
        category_id=cat.id,
        sku="FRIES-01",
        name_en="French Fries",
        name_km="ដំឡូងបារាំងបំពង",
        base_price=Decimal("1.50"),
        currency="USD",
        prep_time_minutes=5,
        kitchen_station="fryer",
        is_active=True,
    )
    item_drink = MenuItem(
        organization_id=org.id,
        business_id=biz.id,
        category_id=cat.id,
        sku="COKE-01",
        name_en="Coca Cola",
        name_km="កូកាកូឡា",
        base_price=Decimal("1.00"),
        currency="USD",
        prep_time_minutes=1,
        kitchen_station="bar",
        is_active=True,
    )
    session.add_all([item_main1, item_main2, item_side, item_drink])
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch, cat, (item_main1, item_main2, item_side, item_drink)


@pytest.mark.anyio
async def test_create_and_get_lunch_combo_with_nested_groups_and_surcharges():
    """Test creating a nested combo bundle with choices and item surcharges."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat, items = await setup_test_tenant(session)
        main1, main2, side, drink = items
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create Lunch Combo with nested Choice Groups
            create_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/combos",
                headers=headers,
                json={
                    "name_en": "Executive Lunch Combo",
                    "name_km": "ឈុតអាហារថ្ងៃត្រង់ពិសេស",
                    "description_en": "Choose 1 Main, 1 Side, and 1 Drink",
                    "category_id": str(cat.id),
                    "sku": "COMBO-LUNCH-01",
                    "pricing_type": "FIXED",
                    "base_price": 6.00,
                    "currency": "USD",
                    "groups": [
                        {
                            "name_en": "Choice of Main Dish",
                            "name_km": "ជ្រើសរើសម្ហូបចម្បង",
                            "min_quantity": 1,
                            "max_quantity": 1,
                            "display_order": 1,
                            "items": [
                                {
                                    "menu_item_id": str(main1.id),
                                    "additional_price": 0.00,
                                    "is_default": True,
                                },
                                {
                                    "menu_item_id": str(main2.id),
                                    "additional_price": 3.00,  # Premium steak upgrade
                                    "is_default": False,
                                },
                            ],
                        },
                        {
                            "name_en": "Choice of Side",
                            "name_km": "ជ្រើសរើសម្ហូបបន្ទាប់បន្សំ",
                            "min_quantity": 1,
                            "max_quantity": 1,
                            "display_order": 2,
                            "items": [
                                {
                                    "menu_item_id": str(side.id),
                                    "additional_price": 0.00,
                                    "is_default": True,
                                }
                            ],
                        },
                        {
                            "name_en": "Choice of Drink",
                            "name_km": "ជ្រើសរើសភេសជ្ជៈ",
                            "min_quantity": 1,
                            "max_quantity": 1,
                            "display_order": 3,
                            "items": [
                                {
                                    "menu_item_id": str(drink.id),
                                    "additional_price": 0.00,
                                    "is_default": True,
                                }
                            ],
                        },
                    ],
                },
            )
            assert create_resp.status_code == status.HTTP_201_CREATED
            combo_data = create_resp.json()
            combo_id = combo_data["id"]
            assert combo_data["name_en"] == "Executive Lunch Combo"
            assert Decimal(str(combo_data["base_price"])) == Decimal("6.00")
            assert len(combo_data["groups"]) == 3

            # 2. Get Combo by ID and verify nested populated item details
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/combos/{combo_id}",
                headers=headers,
            )
            assert get_resp.status_code == status.HTTP_200_OK
            detail = get_resp.json()
            mains = detail["groups"][0]
            assert mains["name_en"] == "Choice of Main Dish"
            assert len(mains["items"]) == 2
            assert mains["items"][0]["menu_item_name_en"] == "Classic Cheeseburger"
            assert mains["items"][1]["menu_item_name_en"] == "Sirloin Steak"
            assert Decimal(str(mains["items"][1]["additional_price"])) == Decimal(
                "3.00"
            )

            # 3. List Combos with search filter
            list_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/combos?search=Lunch",
                headers=headers,
            )
            assert list_resp.status_code == status.HTTP_200_OK
            assert list_resp.json()["total"] == 1

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_update_and_delete_combo_and_groups():
    """Test updating combo bundle fields and adding/deleting choice groups."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch, cat, items = await setup_test_tenant(session)
        main1, _, side, _ = items
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create basic combo
            c_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/combos",
                headers=headers,
                json={"name_en": "Duo Set", "base_price": 5.00},
            )
            combo_id = c_resp.json()["id"]

            # 2. Patch combo
            patch_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/combos/{combo_id}",
                headers=headers,
                json={"base_price": 5.50, "name_en": "Premium Duo Set"},
            )
            assert patch_resp.status_code == status.HTTP_200_OK
            assert Decimal(str(patch_resp.json()["base_price"])) == Decimal("5.50")
            assert patch_resp.json()["name_en"] == "Premium Duo Set"

            # 3. Add a choice group to the combo
            grp_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/combos/{combo_id}/groups",
                headers=headers,
                json={
                    "name_en": "Pick a Side",
                    "min_quantity": 1,
                    "max_quantity": 1,
                    "items": [{"menu_item_id": str(side.id)}],
                },
            )
            assert grp_resp.status_code == status.HTTP_201_CREATED
            group_id = grp_resp.json()["groups"][0]["id"]

            # 4. Delete the choice group
            del_grp_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/combos/{combo_id}/groups/{group_id}",
                headers=headers,
            )
            assert del_grp_resp.status_code == status.HTTP_200_OK
            assert len(del_grp_resp.json()["groups"]) == 0

            # 5. Delete entire combo
            del_combo_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/combos/{combo_id}",
                headers=headers,
            )
            assert del_combo_resp.status_code == status.HTTP_204_NO_CONTENT

            # 6. Confirm deleted
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/combos/{combo_id}",
                headers=headers,
            )
            assert get_resp.status_code == status.HTTP_404_NOT_FOUND

        app.dependency_overrides.clear()

    await engine.dispose()
