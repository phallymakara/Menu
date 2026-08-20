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
from app.models.enums import MembershipStatus, OrganizationStatus, UserStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def setup_test_tenant(
    session, org_name="Test Org", org_slug=None, email="owner@example.com"
):
    """
    Helper to create a tenant user, active organization, membership, and business.
    """
    if org_slug is None:
        org_slug = f"slug-{uuid4().hex[:8]}"

    user = User(
        email=email,
        password_hash="hashed_password",
        full_name="Owner User",
        status=UserStatus.ACTIVE,
    )
    org = Organization(
        name=org_name,
        slug=org_slug,
        status=OrganizationStatus.ACTIVE,
        is_active=True,
    )
    session.add_all([user, org])
    await session.flush()

    mem = OrganizationMembership(
        organization_id=org.id,
        user_id=user.id,
        status=MembershipStatus.ACTIVE,
        is_owner=True,
    )
    biz = Business(
        organization_id=org.id,
        name_en=f"{org_name} Business",
        business_type="Restaurant",
        phone="+85512345678",
        is_active=True,
    )
    session.add_all([mem, biz])
    await session.commit()
    return user, org, biz


@pytest.mark.anyio
async def test_tenant_can_create_branch_with_operational_settings():
    """Test creating a new branch with operational configurations and split shifts."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {
                "name_en": "Toul Kork Branch",
                "name_km": "សាខាទួលគោក",
                "code": "TK-01",
                "phone": "+85523888999",
                "address": "Street 315, Phnom Penh",
                "timezone": "Asia/Phnom_Penh",
                "default_language": "km",
                "base_currency": "USD",
                "operating_hours": {
                    "monday": {
                        "is_closed": False,
                        "slots": [
                            {"open_time": "07:00", "close_time": "14:00"},
                            {"open_time": "17:00", "close_time": "22:00"},
                        ],
                    },
                    "sunday": {"is_closed": True, "slots": []},
                },
                "is_active": True,
            }

            response = await client.post(
                f"/api/v1/businesses/{biz.id}/branches",
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name_en"] == "Toul Kork Branch"
        assert data["name_km"] == "សាខាទួលគោក"
        assert data["code"] == "TK-01"
        assert data["base_currency"] == "USD"
        assert data["default_language"] == "km"
        assert data["is_active"] is True
        assert data["business_id"] == str(biz.id)
        assert data["organization_id"] == str(org.id)
        assert "operating_hours" in data
        assert data["operating_hours"]["monday"]["slots"][0]["open_time"] == "07:00"

    await engine.dispose()


@pytest.mark.anyio
async def test_create_branch_duplicate_code_returns_409():
    """
    Test that creating a branch with duplicate code under same business returns 409.
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz = await setup_test_tenant(session)
        token = create_access_token(user.id)

        # Pre-seed a branch with code 'MAIN'
        existing_branch = Branch(
            organization_id=org.id,
            business_id=biz.id,
            name_en="Main Branch",
            code="MAIN",
            is_active=True,
        )
        session.add(existing_branch)
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/businesses/{biz.id}/branches",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "name_en": "Duplicate Main",
                    "code": "MAIN",
                },
            )

        app.dependency_overrides.clear()
        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already exists" in response.json()["detail"]

    await engine.dispose()


@pytest.mark.anyio
async def test_list_branches_with_active_status_filter():
    """Test listing branches and filtering by active status."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz = await setup_test_tenant(session)
        token = create_access_token(user.id)

        branch_active = Branch(
            organization_id=org.id,
            business_id=biz.id,
            name_en="Open Branch",
            code="OPEN-01",
            is_active=True,
        )
        branch_closed = Branch(
            organization_id=org.id,
            business_id=biz.id,
            name_en="Closed Branch",
            code="CLOSED-01",
            is_active=False,
        )
        session.add_all([branch_active, branch_closed])
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. List all branches
            resp_all = await client.get(
                f"/api/v1/businesses/{biz.id}/branches",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp_all.status_code == status.HTTP_200_OK
            assert len(resp_all.json()) == 2

            # 2. Filter active only
            resp_active = await client.get(
                f"/api/v1/businesses/{biz.id}/branches?is_active=true",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp_active.status_code == status.HTTP_200_OK
            assert len(resp_active.json()) == 1
            assert resp_active.json()[0]["code"] == "OPEN-01"

            # 3. Filter inactive only
            resp_inactive = await client.get(
                f"/api/v1/businesses/{biz.id}/branches?is_active=false",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp_inactive.status_code == status.HTTP_200_OK
            assert len(resp_inactive.json()) == 1
            assert resp_inactive.json()[0]["code"] == "CLOSED-01"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_get_and_update_branch_settings():
    """
    Test retrieving and updating branch configurations (toggle open/closed,
    currency, language).
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz = await setup_test_tenant(session)
        token = create_access_token(user.id)

        branch = Branch(
            organization_id=org.id,
            business_id=biz.id,
            name_en="Original Branch",
            name_km="សាខាដើម",
            code="B-01",
            base_currency="USD",
            default_language="km",
            is_active=True,
        )
        session.add(branch)
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Get branch
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert get_resp.status_code == status.HTTP_200_OK
            assert get_resp.json()["name_en"] == "Original Branch"

            # 2. Patch operational configurations: switch currency, language, status
            patch_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "base_currency": "KHR",
                    "default_language": "en",
                    "is_active": False,
                    "name_en": "Updated Branch Name",
                },
            )
            assert patch_resp.status_code == status.HTTP_200_OK
            data = patch_resp.json()
            assert data["name_en"] == "Updated Branch Name"
            assert data["base_currency"] == "KHR"
            assert data["default_language"] == "en"
            assert data["is_active"] is False
            # Ensure unmodified fields like code and name_km are preserved
            assert data["code"] == "B-01"
            assert data["name_km"] == "សាខាដើម"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_delete_branch():
    """Test deleting a branch entity under active tenant."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz = await setup_test_tenant(session)
        token = create_access_token(user.id)

        branch = Branch(
            organization_id=org.id,
            business_id=biz.id,
            name_en="Branch to Delete",
            code="DEL-01",
            is_active=True,
        )
        session.add(branch)
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            del_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert del_resp.status_code == status.HTTP_204_NO_CONTENT

            # Subsequent fetch returns 404
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert get_resp.status_code == status.HTTP_404_NOT_FOUND

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_cross_tenant_branch_isolation():
    """Test that Tenant A cannot access, modify, or delete Tenant B's branch."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user_a, org_a, biz_a = await setup_test_tenant(
            session, org_name="Tenant A", email="a@example.com"
        )
        user_b, org_b, biz_b = await setup_test_tenant(
            session, org_name="Tenant B", email="b@example.com"
        )

        branch_b = Branch(
            organization_id=org_b.id,
            business_id=biz_b.id,
            name_en="Tenant B Secret Branch",
            code="TB-01",
            is_active=True,
        )
        session.add(branch_b)
        await session.commit()

        token_a = create_access_token(user_a.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers_a = {"Authorization": f"Bearer {token_a}"}

            # 1. Tenant A tries to GET Tenant B's branch -> 404
            resp_get = await client.get(
                f"/api/v1/businesses/{biz_b.id}/branches/{branch_b.id}",
                headers=headers_a,
            )
            assert resp_get.status_code == status.HTTP_404_NOT_FOUND

            # 2. Tenant A tries to PATCH Tenant B's branch -> 404
            resp_patch = await client.patch(
                f"/api/v1/businesses/{biz_b.id}/branches/{branch_b.id}",
                headers=headers_a,
                json={"name_en": "Hacked Name"},
            )
            assert resp_patch.status_code == status.HTTP_404_NOT_FOUND

            # 3. Tenant A tries to DELETE Tenant B's branch -> 404
            resp_del = await client.delete(
                f"/api/v1/businesses/{biz_b.id}/branches/{branch_b.id}",
                headers=headers_a,
            )
            assert resp_del.status_code == status.HTTP_404_NOT_FOUND

            # 4. Tenant A tries to CREATE a branch under Tenant B's business -> 404
            resp_create = await client.post(
                f"/api/v1/businesses/{biz_b.id}/branches",
                headers=headers_a,
                json={"name_en": "Illegal Branch", "code": "ILL-01"},
            )
            assert resp_create.status_code == status.HTTP_404_NOT_FOUND

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_branch_validation_errors():
    """Test validation errors for invalid currency, language, or missing fields."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz = await setup_test_tenant(session)
        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Invalid currency "EUR"
            resp_curr = await client.post(
                f"/api/v1/businesses/{biz.id}/branches",
                headers=headers,
                json={"name_en": "Branch 1", "code": "B1", "base_currency": "EUR"},
            )
            assert resp_curr.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

            # 2. Invalid language "fr"
            resp_lang = await client.post(
                f"/api/v1/businesses/{biz.id}/branches",
                headers=headers,
                json={"name_en": "Branch 1", "code": "B1", "default_language": "fr"},
            )
            assert resp_lang.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

            # 3. Missing required 'code'
            resp_missing = await client.post(
                f"/api/v1/businesses/{biz.id}/branches",
                headers=headers,
                json={"name_en": "Branch 1"},
            )
            assert resp_missing.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

        app.dependency_overrides.clear()

    await engine.dispose()
