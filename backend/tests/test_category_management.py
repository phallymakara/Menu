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
    org_name="Category Org",
    email="cat_owner@example.com",
):
    """Helper to setup user, org, business, branch with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Category Owner",
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
    session.add(branch)
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch


@pytest.mark.anyio
async def test_create_parent_and_bilingual_subcategories():
    """Test creating parent and nested subcategories with bilingual content."""
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

            # 1. Create parent category: Khmer Food
            p_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/categories",
                headers=headers,
                json={
                    "name_en": "Khmer Traditional Food",
                    "name_km": "ម្ហូបប្រពៃណីខ្មែរ",
                    "description_en": "Authentic Khmer dishes and soups",
                    "description_km": "មុខម្ហូបខ្មែរបុរាណរសជាតិឆ្ងាញ់ពិសា",
                    "icon": "bowl-food",
                    "display_order": 1,
                },
            )
            assert p_resp.status_code == status.HTTP_201_CREATED
            parent_id = p_resp.json()["id"]
            assert p_resp.json()["name_km"] == "ម្ហូបប្រពៃណីខ្មែរ"
            assert p_resp.json()["parent_id"] is None

            # 2. Create subcategory: Soups & Curries
            s_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/categories",
                headers=headers,
                json={
                    "name_en": "Soups & Curries",
                    "name_km": "សម្ល និង ការី",
                    "parent_id": parent_id,
                    "display_order": 1,
                },
            )
            assert s_resp.status_code == status.HTTP_201_CREATED
            sub_id = s_resp.json()["id"]
            assert s_resp.json()["parent_id"] == parent_id

            # 3. Create second subcategory: Stir Fry
            s2_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/categories",
                headers=headers,
                json={
                    "name_en": "Stir Fry & Fried Rice",
                    "name_km": "ឆា និង បាយឆា",
                    "parent_id": parent_id,
                    "display_order": 2,
                },
            )
            assert s2_resp.status_code == status.HTTP_201_CREATED

            # 4. View single category
            get_sub = await client.get(
                f"/api/v1/businesses/{biz.id}/categories/{sub_id}",
                headers=headers,
            )
            assert get_sub.status_code == status.HTTP_200_OK
            assert get_sub.json()["name_en"] == "Soups & Curries"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_list_categories_flat_and_tree_hierarchy():
    """Test retrieving flat category list vs nested hierarchical tree."""
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

            # Setup Category 1 with 2 subcategories
            c1 = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/categories",
                    headers=headers,
                    json={
                        "name_en": "Beverages",
                        "name_km": "ភេសជ្ជៈ",
                        "display_order": 1,
                    },
                )
            ).json()

            await client.post(
                f"/api/v1/businesses/{biz.id}/categories",
                headers=headers,
                json={"name_en": "Coffee", "parent_id": c1["id"], "display_order": 1},
            )
            await client.post(
                f"/api/v1/businesses/{biz.id}/categories",
                headers=headers,
                json={"name_en": "Tea", "parent_id": c1["id"], "display_order": 2},
            )

            # Setup standalone category 2
            await client.post(
                f"/api/v1/businesses/{biz.id}/categories",
                headers=headers,
                json={"name_en": "Desserts", "name_km": "បង្អែម", "display_order": 2},
            )

            # 1. Test flat listing
            flat_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/categories",
                headers=headers,
            )
            assert flat_resp.status_code == status.HTTP_200_OK
            flat_data = flat_resp.json()
            assert len(flat_data) == 4

            # 2. Test tree listing
            tree_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/categories?tree=true",
                headers=headers,
            )
            assert tree_resp.status_code == status.HTTP_200_OK
            tree_data = tree_resp.json()
            assert len(tree_data) == 2  # Beverages and Desserts at root
            bev = [item for item in tree_data if item["name_en"] == "Beverages"][0]
            assert len(bev["subcategories"]) == 2
            assert bev["subcategories"][0]["name_en"] == "Coffee"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_update_and_reorder_categories():
    """Test updating category fields and batch reordering."""
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

            c1 = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/categories",
                    headers=headers,
                    json={"name_en": "Appetizers", "display_order": 1},
                )
            ).json()
            c2 = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/categories",
                    headers=headers,
                    json={"name_en": "Mains", "display_order": 2},
                )
            ).json()

            # 1. Update c1 name and icon
            up_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/categories/{c1['id']}",
                headers=headers,
                json={"name_en": "Starters & Appetizers", "icon": "utensils"},
            )
            assert up_resp.status_code == status.HTTP_200_OK
            assert up_resp.json()["name_en"] == "Starters & Appetizers"
            assert up_resp.json()["icon"] == "utensils"

            # 2. Batch reorder (swap order)
            reorder_resp = await client.put(
                f"/api/v1/businesses/{biz.id}/categories/reorder",
                headers=headers,
                json={
                    "items": [
                        {"id": c1["id"], "display_order": 10},
                        {"id": c2["id"], "display_order": 5},
                    ]
                },
            )
            assert reorder_resp.status_code == status.HTTP_200_OK
            reordered = reorder_resp.json()
            mains = [c for c in reordered if c["id"] == c2["id"]][0]
            assert mains["display_order"] == 5

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_category_hierarchy_validation_and_cascade_delete():
    """Test validation guards on parent assignment and cascade delete."""
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

            # 1. Create parent and subcategory
            p = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/categories",
                    headers=headers,
                    json={"name_en": "Parent Cat"},
                )
            ).json()
            s = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/categories",
                    headers=headers,
                    json={"name_en": "Sub Cat", "parent_id": p["id"]},
                )
            ).json()

            # 2. Cannot set category as its own parent -> 409
            self_parent_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/categories/{p['id']}",
                headers=headers,
                json={"parent_id": p["id"]},
            )
            assert self_parent_resp.status_code == status.HTTP_409_CONFLICT

            # 3. Cannot nest beyond 2 levels (subcategory under a subcategory) -> 409
            deep_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/categories",
                headers=headers,
                json={"name_en": "Level 3 Subcat", "parent_id": s["id"]},
            )
            assert deep_resp.status_code == status.HTTP_409_CONFLICT

            # 4. Delete parent category -> subcategory is also deleted
            del_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/categories/{p['id']}",
                headers=headers,
            )
            assert del_resp.status_code == status.HTTP_204_NO_CONTENT

            # Verify subcategory is also gone
            get_s = await client.get(
                f"/api/v1/businesses/{biz.id}/categories/{s['id']}",
                headers=headers,
            )
            assert get_s.status_code == status.HTTP_404_NOT_FOUND

        app.dependency_overrides.clear()

    await engine.dispose()
