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
    org_name="Branch Menu Org",
    email="bm_owner@example.com",
):
    """Helper to setup user, org, business, branches, categories, and items."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Branch Menu Owner",
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
        name_en=f"{org_name} Coffee Roasters",
        business_type="Cafe",
        base_currency="USD",
        exchange_rate=Decimal("4100.00"),
        is_active=True,
    )
    session.add_all([mem, biz])
    await session.flush()

    branch_downtown = Branch(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Downtown Branch",
        code="DT01",
        is_active=True,
    )
    branch_airport = Branch(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Airport Terminal Branch",
        code="AP01",
        is_active=True,
    )
    cat_coffee = Category(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Espresso & Coffee",
        name_km="កាហ្វេ",
        display_order=1,
        is_active=True,
    )
    cat_bakery = Category(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Fresh Bakery",
        name_km="នំបុ័ង",
        display_order=2,
        is_active=True,
    )
    session.add_all([branch_downtown, branch_airport, cat_coffee, cat_bakery])
    await session.flush()

    item_latte = MenuItem(
        organization_id=org.id,
        business_id=biz.id,
        category_id=cat_coffee.id,
        sku="LATTE-01",
        name_en="Vanilla Latte",
        name_km="វ៉ានីឡាឡាតេ",
        base_price=Decimal("3.00"),
        currency="USD",
        is_active=True,
    )
    item_croissant = MenuItem(
        organization_id=org.id,
        business_id=biz.id,
        category_id=cat_bakery.id,
        sku="BAKE-01",
        name_en="Butter Croissant",
        name_km="នំក្រូសង់",
        base_price=Decimal("2.00"),
        currency="USD",
        is_active=True,
    )
    session.add_all([item_latte, item_croissant])
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return (
        user,
        org,
        biz,
        (branch_downtown, branch_airport),
        (cat_coffee, cat_bakery),
        (item_latte, item_croissant),
    )


@pytest.mark.anyio
async def test_branch_price_override_and_resolved_published_menu():
    """Test setting custom price at airport branch and verifying live resolved menu."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branches, categories, items = await setup_test_tenant(session)
        dt_branch, ap_branch = branches
        cat_coffee, _ = categories
        latte, _ = items
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Airport Branch sets custom price override: $3.75 (vs master $3.00)
            set_ov_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{ap_branch.id}/menu/overrides/{latte.id}",
                headers=headers,
                json={
                    "menu_item_id": str(latte.id),
                    "price_override": 3.75,
                    "availability_status": "AVAILABLE",
                },
            )
            assert set_ov_resp.status_code == status.HTTP_200_OK
            assert Decimal(str(set_ov_resp.json()["price_override"])) == Decimal("3.75")

            # 2. Get Live Published Menu for Airport Branch
            ap_menu_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{ap_branch.id}/menu/published",
                headers=headers,
            )
            assert ap_menu_resp.status_code == status.HTTP_200_OK
            ap_menu = ap_menu_resp.json()
            coffee_cat = [
                c for c in ap_menu["categories"] if c["id"] == str(cat_coffee.id)
            ][0]
            latte_res = [i for i in coffee_cat["items"] if i["id"] == str(latte.id)][0]
            assert Decimal(str(latte_res["master_price"])) == Decimal("3.00")
            assert Decimal(str(latte_res["price_override"])) == Decimal("3.75")
            assert Decimal(str(latte_res["effective_price"])) == Decimal("3.75")

            # 3. Get Live Published Menu for Downtown Branch
            # (No override -> Master Price $3.00)
            dt_menu_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{dt_branch.id}/menu/published",
                headers=headers,
            )
            assert dt_menu_resp.status_code == status.HTTP_200_OK
            dt_menu = dt_menu_resp.json()
            dt_coffee = [
                c for c in dt_menu["categories"] if c["id"] == str(cat_coffee.id)
            ][0]
            dt_latte = [i for i in dt_coffee["items"] if i["id"] == str(latte.id)][0]
            assert dt_latte["price_override"] is None
            assert Decimal(str(dt_latte["effective_price"])) == Decimal("3.00")

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_branch_stock_availability_toggles_and_bulk_update():
    """Test stock toggles (out of stock, hidden) and bulk override updating."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branches, categories, items = await setup_test_tenant(session)
        dt_branch, _ = branches
        _, cat_bakery = categories
        latte, croissant = items
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Bulk update: Croissant 86'd (TEMPORARILY_OUT_OF_STOCK), Latte HIDDEN
            bulk_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{dt_branch.id}/menu/overrides/bulk",
                headers=headers,
                json={
                    "overrides": [
                        {
                            "menu_item_id": str(croissant.id),
                            "availability_status": "TEMPORARILY_OUT_OF_STOCK",
                        },
                        {
                            "menu_item_id": str(latte.id),
                            "availability_status": "HIDDEN",
                        },
                    ]
                },
            )
            assert bulk_resp.status_code == status.HTTP_200_OK
            assert len(bulk_resp.json()) == 2

            # 2. Get published menu without hidden items
            pub_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{dt_branch.id}/menu/published",
                headers=headers,
            )
            assert pub_resp.status_code == status.HTTP_200_OK
            pub_data = pub_resp.json()
            # Latte should be omitted
            coffee_cat = [
                c for c in pub_data["categories"] if c["name_en"] == "Espresso & Coffee"
            ][0]
            assert len(coffee_cat["items"]) == 0

            # Croissant should be visible but marked not available
            bakery_cat = [
                c for c in pub_data["categories"] if c["name_en"] == "Fresh Bakery"
            ][0]
            assert len(bakery_cat["items"]) == 1
            cr_item = bakery_cat["items"][0]
            assert cr_item["availability_status"] == "TEMPORARILY_OUT_OF_STOCK"
            assert cr_item["is_available"] is False

            # 3. Reset Croissant override back to master
            del_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/branches/{dt_branch.id}/menu/overrides/{croissant.id}",
                headers=headers,
            )
            assert del_resp.status_code == status.HTTP_204_NO_CONTENT

            # Verify reset
            reset_menu_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{dt_branch.id}/menu/published",
                headers=headers,
            )
            bakery_res = [
                c
                for c in reset_menu_resp.json()["categories"]
                if c["name_en"] == "Fresh Bakery"
            ][0]
            assert bakery_res["items"][0]["availability_status"] == "AVAILABLE"
            assert bakery_res["items"][0]["is_available"] is True

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_selective_category_assignment_to_branch():
    """Test assigning specific categories to a branch."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branches, categories, items = await setup_test_tenant(session)
        _, ap_branch = branches
        cat_coffee, _ = categories
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # Assign only Coffee category to Airport branch (Exclude Bakery)
            assign_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{ap_branch.id}/menu/categories",
                headers=headers,
                json={"category_ids": [str(cat_coffee.id)]},
            )
            assert assign_resp.status_code == status.HTTP_200_OK
            assert len(assign_resp.json()) == 1

            # Verify Airport published menu contains only Coffee category
            pub_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{ap_branch.id}/menu/published",
                headers=headers,
            )
            assert pub_resp.status_code == status.HTTP_200_OK
            cats = pub_resp.json()["categories"]
            assert len(cats) == 1
            assert cats[0]["name_en"] == "Espresso & Coffee"

        app.dependency_overrides.clear()

    await engine.dispose()
