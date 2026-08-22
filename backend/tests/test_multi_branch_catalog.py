from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token
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

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def multi_branch_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            id=uuid4(),
            email="manager@multibranch.com",
            password_hash="hash1",
            full_name="Brand General Manager",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            id=uuid4(),
            name="Khmer Bistro Group",
            slug="khmer-bistro-grp",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([user, org])
        await session.flush()

        membership = OrganizationMembership(
            organization_id=org.id,
            user_id=user.id,
            status=MembershipStatus.ACTIVE,
            role=StaffRole.MANAGER,
            is_owner=True,
        )
        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Khmer Bistro Brand",
            business_type="Restaurant Chain",
            exchange_rate=Decimal("4100.00"),
            is_active=True,
        )
        branch_a = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Siem Reap Pub Street",
            code="SR01",
            is_active=True,
        )
        branch_b = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Phnom Penh Riverside",
            code="PP01",
            is_active=True,
        )
        cat_main = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=None,  # Master Category
            name_en="Mains",
            display_order=1,
            is_active=True,
        )
        cat_drinks = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=None,  # Master Category
            name_en="Beverages",
            display_order=2,
            is_active=True,
        )

        # Central Master Item
        master_loklak = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=None,  # Global Master
            category_id=cat_main.id,
            name_en="Beef Lok Lak",
            base_price=Decimal("12.00"),
            is_active=True,
        )
        session.add_all([
            membership,
            business,
            branch_a,
            branch_b,
            cat_main,
            cat_drinks,
            master_loklak,
        ])
        await session.commit()

        token = create_access_token(user.id)

    yield {
        "engine": engine,
        "sessionmaker": sessionmaker,
        "token": token,
        "org_id": org.id,
        "business_id": business.id,
        "branch_a_id": branch_a.id,
        "branch_b_id": branch_b.id,
        "cat_main_id": cat_main.id,
        "cat_drinks_id": cat_drinks.id,
        "master_loklak_id": master_loklak.id,
    }

    await engine.dispose()


@pytest.mark.anyio
async def test_branch_menu_merges_master_and_local_items(multi_branch_setup):
    """
    Validates that a branch published menu seamlessly contains:
    1. Global Master Items (with localized price overrides).
    2. Branch A local items (ONLY in Branch A).
    3. Branch B local items (ONLY in Branch B).
    """
    headers = {"Authorization": f"Bearer {multi_branch_setup['token']}"}

    async def override_get_db():
        async with multi_branch_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create local item for Branch A (Siem Reap Palm Sugar Latte)
        res_a = await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_a_id']}/menu/local-items",
            headers=headers,
            json={
                "name_en": "Palm Sugar Latte",
                "category_id": str(multi_branch_setup["cat_drinks_id"]),
                "base_price": 3.50,
            },
        )
        assert res_a.status_code == status.HTTP_201_CREATED
        latte_id = res_a.json()["id"]

        # 2. Create local item for Branch B (Riverside Sunset Cocktail)
        res_b = await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_b_id']}/menu/local-items",
            headers=headers,
            json={
                "name_en": "Sunset Cocktail",
                "category_id": str(multi_branch_setup["cat_drinks_id"]),
                "base_price": 6.00,
            },
        )
        assert res_b.status_code == status.HTTP_201_CREATED
        cocktail_id = res_b.json()["id"]

        # 3. Fetch Published Menu for Branch A
        menu_a_res = await client.get(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_a_id']}/menu/published",
            headers=headers,
        )
        assert menu_a_res.status_code == status.HTTP_200_OK
        menu_a_data = menu_a_res.json()

        all_item_names_a = [
            item["name_en"]
            for cat in menu_a_data["categories"]
            for item in cat["items"]
        ]
        assert "Beef Lok Lak" in all_item_names_a
        assert "Palm Sugar Latte" in all_item_names_a
        assert "Sunset Cocktail" not in all_item_names_a  # Must NOT be in Branch A

        # 4. Fetch Published Menu for Branch B
        menu_b_res = await client.get(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_b_id']}/menu/published",
            headers=headers,
        )
        assert menu_b_res.status_code == status.HTTP_200_OK
        menu_b_data = menu_b_res.json()

        all_item_names_b = [
            item["name_en"]
            for cat in menu_b_data["categories"]
            for item in cat["items"]
        ]
        assert "Beef Lok Lak" in all_item_names_b
        assert "Sunset Cocktail" in all_item_names_b
        assert "Palm Sugar Latte" not in all_item_names_b  # Must NOT be in Branch B

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_branch_price_override_and_reset_to_master(multi_branch_setup):
    """
    Tests applying a branch price override and then resetting back to master catalog defaults.
    """
    headers = {"Authorization": f"Bearer {multi_branch_setup['token']}"}

    async def override_get_db():
        async with multi_branch_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Set Branch A override on Beef Lok Lak -> $14.50
        set_res = await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_a_id']}/menu/overrides/{multi_branch_setup['master_loklak_id']}",
            headers=headers,
            json={
                "menu_item_id": str(multi_branch_setup["master_loklak_id"]),
                "price_override": 14.50,
                "availability_status": "AVAILABLE",
            },
        )
        assert set_res.status_code == status.HTTP_200_OK

        # Verify Branch A sees effective price $14.50
        menu_res = await client.get(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_a_id']}/menu/published",
            headers=headers,
        )
        loklak_item = next(
            item
            for cat in menu_res.json()["categories"]
            for item in cat["items"]
            if item["id"] == str(multi_branch_setup["master_loklak_id"])
        )
        assert Decimal(str(loklak_item["effective_price"])) == Decimal("14.50")
        assert Decimal(str(loklak_item["master_price"])) == Decimal("12.00")

        # Reset overrides back to master
        reset_res = await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_a_id']}/menu/reset-to-master",
            headers=headers,
            json={"reset_prices": True},
        )
        assert reset_res.status_code == status.HTTP_200_OK
        assert reset_res.json()["reset_count"] == 1

        # Verify Branch A now sees master price $12.00
        menu_after = await client.get(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_a_id']}/menu/published",
            headers=headers,
        )
        loklak_after = next(
            item
            for cat in menu_after.json()["categories"]
            for item in cat["items"]
            if item["id"] == str(multi_branch_setup["master_loklak_id"])
        )
        assert Decimal(str(loklak_after["effective_price"])) == Decimal("12.00")
        assert loklak_after["price_override"] is None

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_promote_local_item_to_master(multi_branch_setup):
    """
    Tests creating a local item at Branch A and promoting it to the Master Brand Catalog.
    """
    headers = {"Authorization": f"Bearer {multi_branch_setup['token']}"}

    async def override_get_db():
        async with multi_branch_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create local item at Branch A
        create_res = await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_a_id']}/menu/local-items",
            headers=headers,
            json={
                "name_en": "Truffle Fries",
                "category_id": str(multi_branch_setup["cat_main_id"]),
                "base_price": 5.00,
            },
        )
        assert create_res.status_code == status.HTTP_201_CREATED
        item_id = create_res.json()["id"]

        # 2. Promote to Master Catalog
        promote_res = await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_a_id']}/menu/local-items/{item_id}/promote",
            headers=headers,
        )
        assert promote_res.status_code == status.HTTP_200_OK

        # 3. Verify Truffle Fries now appears in Branch B as well!
        menu_b_res = await client.get(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_b_id']}/menu/published",
            headers=headers,
        )
        all_item_names_b = [
            item["name_en"]
            for cat in menu_b_res.json()["categories"]
            for item in cat["items"]
        ]
        assert "Truffle Fries" in all_item_names_b

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_catalog_comparison_matrix(multi_branch_setup):
    """
    Tests the HQ Catalog Comparison Matrix endpoint.
    """
    headers = {"Authorization": f"Bearer {multi_branch_setup['token']}"}

    async def override_get_db():
        async with multi_branch_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Set override on Branch B for Beef Lok Lak -> $15.00
        await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_b_id']}/menu/overrides/{multi_branch_setup['master_loklak_id']}",
            headers=headers,
            json={
                "menu_item_id": str(multi_branch_setup["master_loklak_id"]),
                "price_override": 15.00,
                "availability_status": "AVAILABLE",
            },
        )

        res = await client.get(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/catalog/comparison",
            headers=headers,
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["total_master_items"] >= 1

        loklak_matrix = next(i for i in data["items"] if i["item_name_en"] == "Beef Lok Lak")
        assert Decimal(str(loklak_matrix["master_base_price_usd"])) == Decimal("12.00")
        assert len(loklak_matrix["branches"]) == 2

        branch_b_detail = next(
            b for b in loklak_matrix["branches"] if b["branch_id"] == str(multi_branch_setup["branch_b_id"])
        )
        assert Decimal(str(branch_b_detail["effective_price_usd"])) == Decimal("15.00")
        assert branch_b_detail["has_price_override"] is True

        branch_a_detail = next(
            b for b in loklak_matrix["branches"] if b["branch_id"] == str(multi_branch_setup["branch_a_id"])
        )
        assert Decimal(str(branch_a_detail["effective_price_usd"])) == Decimal("12.00")
        assert branch_a_detail["has_price_override"] is False

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_sync_master_catalog_to_branches(multi_branch_setup):
    """
    Tests HQ bulk syncing master catalog across branches with preserve_custom_prices toggle.
    """
    headers = {"Authorization": f"Bearer {multi_branch_setup['token']}"}

    async def override_get_db():
        async with multi_branch_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Set override on Branch A for Beef Lok Lak -> $16.00
        await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/branches/{multi_branch_setup['branch_a_id']}/menu/overrides/{multi_branch_setup['master_loklak_id']}",
            headers=headers,
            json={
                "menu_item_id": str(multi_branch_setup["master_loklak_id"]),
                "price_override": 16.00,
                "availability_status": "AVAILABLE",
            },
        )

        # 2. Sync with preserve_custom_prices=True -> override remains
        sync_res1 = await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/catalog/sync-branches",
            headers=headers,
            json={
                "sync_scope": "ALL_ITEMS",
                "preserve_custom_prices": True,
            },
        )
        assert sync_res1.status_code == status.HTTP_200_OK
        data1 = sync_res1.json()
        assert data1["branches_affected_count"] == 2
        assert data1["overrides_preserved_count"] == 1
        assert data1["overrides_reset_count"] == 0

        # 3. Sync with preserve_custom_prices=False -> override is reset to master
        sync_res2 = await client.post(
            f"/api/v1/businesses/{multi_branch_setup['business_id']}/catalog/sync-branches",
            headers=headers,
            json={
                "sync_scope": "ALL_ITEMS",
                "preserve_custom_prices": False,
            },
        )
        assert sync_res2.status_code == status.HTTP_200_OK
        data2 = sync_res2.json()
        assert data2["overrides_reset_count"] == 1

    app.dependency_overrides.clear()

