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
from app.models.dining_area import DiningArea
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
    org_name="Table Org",
    email="table_owner@example.com",
):
    """Helper to setup user, org, business, branch with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Table Owner",
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
        name_en=f"{org_name} Eatery",
        business_type="Restaurant",
        is_active=True,
    )
    session.add_all([mem, biz])
    await session.flush()

    branch = Branch(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Downtown Hub",
        code="DH01",
        is_active=True,
    )
    session.add(branch)
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch


@pytest.mark.anyio
async def test_create_single_table_with_attributes_and_area():
    """Test creating single table with custom shape, capacity, and dining area."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        area = DiningArea(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="VIP Lounge",
            name_km="បន្ទប់ VIP",
        )
        session.add(area)
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables",
                headers=headers,
                json={
                    "table_number": "VIP-01",
                    "name": "Presidential Booth",
                    "dining_area_id": str(area.id),
                    "min_capacity": 2,
                    "max_capacity": 8,
                    "shape": "round",
                    "status": "available",
                    "display_order": 1,
                },
            )
            assert resp.status_code == status.HTTP_201_CREATED
            data = resp.json()
            assert data["table_number"] == "VIP-01"
            assert data["name"] == "Presidential Booth"
            assert data["shape"] == "round"
            assert data["min_capacity"] == 2
            assert data["max_capacity"] == 8
            assert data["dining_area_name_en"] == "VIP Lounge"
            assert data["qr_code_token"] is not None

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_batch_create_tables_sequential_generator():
    """Test generating a batch range of tables in one call."""
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

            # Batch create T-01 through T-05
            batch_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/batch",
                headers=headers,
                json={
                    "prefix": "T-",
                    "start_number": 1,
                    "end_number": 5,
                    "min_capacity": 2,
                    "max_capacity": 4,
                    "shape": "square",
                    "digits": 2,
                },
            )
            assert batch_resp.status_code == status.HTTP_201_CREATED
            tables = batch_resp.json()
            assert len(tables) == 5
            assert [t["table_number"] for t in tables] == [
                "T-01",
                "T-02",
                "T-03",
                "T-04",
                "T-05",
            ]

            # Run again for 4..7 (should create T-06, T-07 without failing)
            batch_resp2 = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/batch",
                headers=headers,
                json={
                    "prefix": "T-",
                    "start_number": 4,
                    "end_number": 7,
                    "min_capacity": 2,
                    "max_capacity": 4,
                    "shape": "square",
                    "digits": 2,
                },
            )
            assert batch_resp2.status_code == status.HTTP_201_CREATED
            all_tables = batch_resp2.json()
            assert len(all_tables) == 7

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_table_status_transition_and_filtering():
    """Test rapid status changes and query filtering by status."""
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

            tbl = (
                await client.post(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables",
                    headers=headers,
                    json={"table_number": "Bar-01", "shape": "bar_seat"},
                )
            ).json()

            # Transition status: available -> occupied
            status_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl['id']}/status",
                headers=headers,
                json={"status": "occupied"},
            )
            assert status_resp.status_code == status.HTTP_200_OK
            assert status_resp.json()["status"] == "occupied"

            # Transition status: occupied -> dirty_cleaning
            clean_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl['id']}/status",
                headers=headers,
                json={"status": "dirty_cleaning"},
            )
            assert clean_resp.status_code == status.HTTP_200_OK
            assert clean_resp.json()["status"] == "dirty_cleaning"

            # Filter by status=dirty_cleaning
            filter_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables?status=dirty_cleaning",
                headers=headers,
            )
            assert filter_resp.status_code == status.HTTP_200_OK
            assert len(filter_resp.json()) == 1

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_duplicate_table_number_conflict_and_deletion():
    """Test duplicate table number 409 conflict and table deletion."""
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

            await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables",
                headers=headers,
                json={"table_number": "T-99"},
            )

            # Duplicate table number
            dup_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables",
                headers=headers,
                json={"table_number": "T-99"},
            )
            assert dup_resp.status_code == status.HTTP_409_CONFLICT

            # Delete table
            tbl = (
                await client.get(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables",
                    headers=headers,
                )
            ).json()[0]

            del_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl['id']}",
                headers=headers,
            )
            assert del_resp.status_code == status.HTTP_204_NO_CONTENT

            # Verify 404
            get_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl['id']}",
                headers=headers,
            )
            assert get_resp.status_code == status.HTTP_404_NOT_FOUND

        app.dependency_overrides.clear()

    await engine.dispose()
