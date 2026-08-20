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
    org_name="Tea Org",
    email="tea_owner@example.com",
):
    """Helper to setup user, org, business, branch, category, item with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Tea Owner",
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
        name_en=f"{org_name} Milk Tea",
        business_type="Beverage",
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
        name_en="Milk Tea Specials",
        name_km="តែទឹកដោះគោពិសេស",
        display_order=1,
        is_active=True,
    )
    session.add_all([branch, cat])
    await session.flush()

    item = MenuItem(
        organization_id=org.id,
        business_id=biz.id,
        category_id=cat.id,
        sku="TEA-01",
        name_en="Brown Sugar Milk Tea",
        name_km="តែទឹកដោះគោស្ករត្នោត",
        base_price=Decimal("2.50"),
        currency="USD",
        prep_time_minutes=3,
        kitchen_station="bar",
        is_active=True,
    )
    session.add(item)
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch, cat, item


@pytest.mark.anyio
async def test_create_modifier_group_with_selection_rules_and_options():
    """Test creating mandatory radio and optional multi-select modifier groups."""
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

            # 1. Create Mandatory Radio Group: Sugar Level (min=1, max=1)
            sugar_grp_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/modifier-groups",
                headers=headers,
                json={
                    "name_en": "Sugar Level",
                    "name_km": "កម្រិតជាតិស្ករ",
                    "min_selections": 1,
                    "max_selections": 1,
                },
            )
            assert sugar_grp_resp.status_code == status.HTTP_201_CREATED
            sugar_grp_id = sugar_grp_resp.json()["id"]

            # Add options to Sugar Level
            await client.post(
                f"/api/v1/businesses/{biz.id}/modifier-groups/{sugar_grp_id}/options",
                headers=headers,
                json={
                    "name_en": "100% Normal Sugar",
                    "name_km": "ស្ករ 100%",
                    "is_default": True,
                },
            )
            await client.post(
                f"/api/v1/businesses/{biz.id}/modifier-groups/{sugar_grp_id}/options",
                headers=headers,
                json={"name_en": "50% Less Sugar", "name_km": "ស្ករ 50%"},
            )
            await client.post(
                f"/api/v1/businesses/{biz.id}/modifier-groups/{sugar_grp_id}/options",
                headers=headers,
                json={"name_en": "0% No Sugar", "name_km": "គ្មានស្ករ 0%"},
            )

            # 2. Create Optional Multi-select Group: Extra Toppings (min=0, max=5)
            top_grp_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/modifier-groups",
                headers=headers,
                json={
                    "name_en": "Extra Toppings",
                    "name_km": "ថែមគ្រឿង",
                    "min_selections": 0,
                    "max_selections": 5,
                },
            )
            assert top_grp_resp.status_code == status.HTTP_201_CREATED
            top_grp_id = top_grp_resp.json()["id"]

            # Add options with extra price
            boba_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/modifier-groups/{top_grp_id}/options",
                headers=headers,
                json={
                    "name_en": "Brown Sugar Boba",
                    "name_km": "គុជស្ករត្នោត",
                    "price": 0.50,
                },
            )
            assert boba_resp.status_code == status.HTTP_201_CREATED
            assert Decimal(str(boba_resp.json()["price"])) == Decimal("0.50")

            # 3. List all modifier groups for business
            list_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/modifier-groups",
                headers=headers,
            )
            assert list_resp.status_code == status.HTTP_200_OK
            groups = list_resp.json()
            assert len(groups) == 2
            sugar = [g for g in groups if g["id"] == sugar_grp_id][0]
            assert len(sugar["options"]) == 3

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_assign_modifier_groups_to_menu_item():
    """Test attaching reusable modifier groups to a specific menu item."""
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

            # Create group
            grp = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/modifier-groups",
                    headers=headers,
                    json={
                        "name_en": "Ice Level",
                        "min_selections": 1,
                        "max_selections": 1,
                    },
                )
            ).json()

            # Assign to item
            assign_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/modifier-groups",
                headers=headers,
                json={"group_ids": [grp["id"]]},
            )
            assert assign_resp.status_code == status.HTTP_200_OK
            assert len(assign_resp.json()) == 1
            assert assign_resp.json()[0]["name_en"] == "Ice Level"

            # Query item's assigned modifier groups
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/items/{item.id}/modifier-groups",
                headers=headers,
            )
            assert get_resp.status_code == status.HTTP_200_OK
            assert len(get_resp.json()) == 1

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_update_and_delete_modifier_group_and_option():
    """Test updating and cascade deleting modifier groups and options."""
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

            # 1. Create group and option
            grp = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/modifier-groups",
                    headers=headers,
                    json={"name_en": "Dressing Options"},
                )
            ).json()

            opt = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/modifier-groups/{grp['id']}/options",
                    headers=headers,
                    json={"name_en": "Ranch", "price": 0.50},
                )
            ).json()

            # 2. Update option
            opt_patch = await client.patch(
                f"/api/v1/businesses/{biz.id}/modifier-groups/{grp['id']}/options/{opt['id']}",
                headers=headers,
                json={"price": 0.75, "name_en": "House Ranch"},
            )
            assert opt_patch.status_code == status.HTTP_200_OK
            assert Decimal(str(opt_patch.json()["price"])) == Decimal("0.75")
            assert opt_patch.json()["name_en"] == "House Ranch"

            # 3. Delete group
            del_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/modifier-groups/{grp['id']}",
                headers=headers,
            )
            assert del_resp.status_code == status.HTTP_204_NO_CONTENT

            # 4. Verify group deleted
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/modifier-groups/{grp['id']}",
                headers=headers,
            )
            assert get_resp.status_code == status.HTTP_404_NOT_FOUND

        app.dependency_overrides.clear()

    await engine.dispose()
