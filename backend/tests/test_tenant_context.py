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
async def test_tenant_context_resolution_success():
    """Test successful tenant context resolution for an active owner."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="owner1@example.com",
            password_hash="hash123",
            full_name="Owner One",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            name="Tenant One",
            slug="tenant-one",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([user, org])
        await session.flush()

        membership = OrganizationMembership(
            organization_id=org.id,
            user_id=user.id,
            status=MembershipStatus.ACTIVE,
            is_owner=True,
        )
        business = Business(
            organization_id=org.id,
            name_en="Business One",
            business_type="Restaurant",
            is_active=True,
        )
        session.add_all([membership, business])
        await session.commit()

        token = create_access_token(user.id)

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/businesses",
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["name_en"] == "Business One"
        assert data[0]["organization_id"] == str(org.id)

    await engine.dispose()


@pytest.mark.anyio
async def test_cross_tenant_isolation_returns_404():
    """Test that Tenant A querying Tenant B's business receives 404 Not Found."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        # Tenant A
        user_a = User(
            email="tenant_a@example.com",
            password_hash="h1",
            full_name="User A",
            status=UserStatus.ACTIVE,
        )
        org_a = Organization(
            name="Org A", slug="org-a", status=OrganizationStatus.ACTIVE, is_active=True
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
            is_active=True,
        )
        session.add_all([mem_a, biz_a])

        # Tenant B
        user_b = User(
            email="tenant_b@example.com",
            password_hash="h2",
            full_name="User B",
            status=UserStatus.ACTIVE,
        )
        org_b = Organization(
            name="Org B", slug="org-b", status=OrganizationStatus.ACTIVE, is_active=True
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
            is_active=True,
        )
        session.add_all([mem_b, biz_b])
        await session.commit()

        token_a = create_access_token(user_a.id)

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Tenant A token requesting Tenant B business_id -> MUST BE DENIED WITH 404
            response = await client.get(
                f"/api/v1/businesses/{biz_b.id}",
                headers={"Authorization": f"Bearer {token_a}"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["detail"] == "Business not found."

    await engine.dispose()


@pytest.mark.anyio
async def test_inactive_organization_rejected():
    """Test that an inactive organization rejects tenant context with 403."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="suspended_owner@example.com",
            password_hash="h3",
            full_name="Suspended Owner",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            name="Suspended Org",
            slug="suspended-org",
            status=OrganizationStatus.SUSPENDED,
            is_active=False,
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

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/v1/businesses",
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_403_FORBIDDEN

    await engine.dispose()


@pytest.mark.anyio
async def test_multi_organization_header_selection():
    """Test explicit organization switching using X-Organization-Id header."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            email="multi_org@example.com",
            password_hash="h4",
            full_name="Multi Org User",
            status=UserStatus.ACTIVE,
        )
        org_1 = Organization(
            name="Org One",
            slug="org-one",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        org_2 = Organization(
            name="Org Two",
            slug="org-two",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([user, org_1, org_2])
        await session.flush()

        mem_1 = OrganizationMembership(
            organization_id=org_1.id, user_id=user.id, status=MembershipStatus.ACTIVE
        )
        mem_2 = OrganizationMembership(
            organization_id=org_2.id, user_id=user.id, status=MembershipStatus.ACTIVE
        )
        biz_1 = Business(
            organization_id=org_1.id, name_en="Biz Org 1", business_type="Restaurant"
        )
        biz_2 = Business(
            organization_id=org_2.id, name_en="Biz Org 2", business_type="Retail"
        )
        session.add_all([mem_1, mem_2, biz_1, biz_2])
        await session.commit()

        token = create_access_token(user.id)

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Request with X-Organization-Id header for Org 2
            response = await client.get(
                "/api/v1/businesses",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Organization-Id": str(org_2.id),
                },
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["name_en"] == "Biz Org 2"
        assert data[0]["organization_id"] == str(org_2.id)

    await engine.dispose()


@pytest.mark.anyio
async def test_owner_registration_minimal_fields():
    """Test owner registration with minimal 3 required fields (email, password, full_name)."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "minimal.owner@example.com",
                    "password": "Password123!",
                    "full_name": "Minimal Owner",
                },
            )

        app.dependency_overrides.clear()

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "user_id" in data
        assert "organization_id" in data
        assert "business_id" in data
        assert "branch_id" in data
        assert data["message"] == "Owner account and business workspace created successfully."

    await engine.dispose()

