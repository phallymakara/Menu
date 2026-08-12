from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.business import Business
from app.models.enums import MembershipStatus, OrganizationStatus, UserStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_tenant_can_update_own_business():
    """Test that a tenant owner can update their own business profile."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="owner@example.com",
            password_hash="h1",
            full_name="Owner",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            name="Org One",
            slug="org-one",
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
            name_en="Original Name",
            business_type="Restaurant",
            phone="+85512345678",
            is_active=True,
        )
        session.add_all([mem, biz])
        await session.commit()

        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"name_en": "Updated Name", "business_type": "Cafe"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name_en"] == "Updated Name"
        assert data["business_type"] == "Cafe"
        assert data["phone"] == "+85512345678"

    await engine.dispose()


@pytest.mark.anyio
async def test_partial_update_preserves_unmodified_fields():
    """Test that fields omitted from the payload remain unchanged."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="owner_partial@example.com",
            password_hash="h1",
            full_name="Owner Partial",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            name="Org Partial",
            slug="org-partial",
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
            name_en="Original En",
            name_km="Original Km",
            business_type="Bakery",
            email="original@example.com",
            is_active=True,
        )
        session.add_all([mem, biz])
        await session.commit()

        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"name_km": "Updated Km"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name_en"] == "Original En"
        assert data["name_km"] == "Updated Km"
        assert data["email"] == "original@example.com"

    await engine.dispose()


@pytest.mark.anyio
async def test_cross_tenant_update_blocked():
    """Test that Tenant A attempting to update Tenant B's business receives 404."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        # Tenant A
        user_a = User(
            email="user_a@example.com",
            password_hash="h1",
            full_name="User A",
            status=UserStatus.ACTIVE,
        )
        org_a = Organization(
            name="Org A",
            slug="org-a",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([user_a, org_a])
        await session.flush()
        mem_a = OrganizationMembership(
            organization_id=org_a.id,
            user_id=user_a.id,
            status=MembershipStatus.ACTIVE,
            is_owner=True,
        )
        biz_a = Business(
            organization_id=org_a.id,
            name_en="Biz A",
            business_type="Cafe",
        )
        session.add_all([mem_a, biz_a])

        # Tenant B
        user_b = User(
            email="user_b@example.com",
            password_hash="h2",
            full_name="User B",
            status=UserStatus.ACTIVE,
        )
        org_b = Organization(
            name="Org B",
            slug="org-b",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([user_b, org_b])
        await session.flush()
        mem_b = OrganizationMembership(
            organization_id=org_b.id,
            user_id=user_b.id,
            status=MembershipStatus.ACTIVE,
            is_owner=True,
        )
        biz_b = Business(
            organization_id=org_b.id,
            name_en="Biz B",
            business_type="Retail",
        )
        session.add_all([mem_b, biz_b])
        await session.commit()

        token_a = create_access_token(user_a.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/v1/businesses/{biz_b.id}",
                headers={"Authorization": f"Bearer {token_a}"},
                json={"name_en": "Hacked Name"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["detail"] == "Business not found."

    await engine.dispose()


@pytest.mark.anyio
async def test_invalid_business_id_returns_404():
    """Test updating a non-existent business ID returns 404 Not Found."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="owner_unknown@example.com",
            password_hash="h1",
            full_name="Owner Unknown",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            name="Org Unknown",
            slug="org-unknown",
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
        session.add(mem)
        await session.commit()

        token = create_access_token(user.id)
        random_id = uuid4()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/v1/businesses/{random_id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"name_en": "New Name"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_404_NOT_FOUND

    await engine.dispose()


@pytest.mark.anyio
async def test_unauthenticated_request_returns_401():
    """Test that PATCH requests without authorization token return 401 Unauthorized."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            f"/api/v1/businesses/{uuid4()}",
            json={"name_en": "Unauthorized Name"},
        )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.anyio
async def test_invalid_email_returns_422():
    """Test that providing an invalid email format returns 422 Unprocessable Entity."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="owner_email_val@example.com",
            password_hash="h1",
            full_name="Owner Email Val",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            name="Org Email Val",
            slug="org-email-val",
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
            name_en="Biz Email Val",
            business_type="Retail",
        )
        session.add_all([mem, biz])
        await session.commit()

        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"email": "invalid-email-format"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    await engine.dispose()


@pytest.mark.anyio
async def test_field_validation_length_returns_422():
    """Test that exceeding maximum field length returns 422 Unprocessable Entity."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="owner_len@example.com",
            password_hash="h1",
            full_name="Owner Len",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            name="Org Len",
            slug="org-len",
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
            name_en="Biz Len",
            business_type="Retail",
        )
        session.add_all([mem, biz])
        await session.commit()

        token = create_access_token(user.id)
        too_long_name = "A" * 151

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"name_en": too_long_name},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    await engine.dispose()


@pytest.mark.anyio
async def test_organization_id_cannot_be_modified():
    """Test that supplying organization_id in body does not modify organization_id."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="owner_org_immutable@example.com",
            password_hash="h1",
            full_name="Owner Org Immutable",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            name="Org Immutable",
            slug="org-immutable",
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
            name_en="Biz Immutable",
            business_type="Retail",
        )
        session.add_all([mem, biz])
        await session.commit()

        token = create_access_token(user.id)
        fake_org_id = str(uuid4())

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"name_en": "Updated Immutable", "organization_id": fake_org_id},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["organization_id"] == str(org.id)
        assert data["organization_id"] != fake_org_id

    await engine.dispose()


@pytest.mark.anyio
async def test_get_reflects_updated_data():
    """Test that a GET request after a PATCH reflects the updated business profile."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="owner_get_check@example.com",
            password_hash="h1",
            full_name="Owner Get Check",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            name="Org Get Check",
            slug="org-get-check",
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
            name_en="Old Name GET",
            business_type="Restaurant",
        )
        session.add_all([mem, biz])
        await session.commit()

        token = create_access_token(user.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. PATCH business
            patch_res = await client.patch(
                f"/api/v1/businesses/{biz.id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"name_en": "New Name GET", "phone": "+85599887766"},
            )
            assert patch_res.status_code == status.HTTP_200_OK

            # 2. GET business
            get_res = await client.get(
                f"/api/v1/businesses/{biz.id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert get_res.status_code == status.HTTP_200_OK
            get_data = get_res.json()
            assert get_data["name_en"] == "New Name GET"
            assert get_data["phone"] == "+85599887766"

        app.dependency_overrides.clear()

    await engine.dispose()
