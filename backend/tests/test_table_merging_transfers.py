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
from app.models.restaurant_table import RestaurantTable
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
    org_name="Transfer Org",
    email="transfer_owner@example.com",
):
    """Helper to setup user, org, business, branch with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Transfer Owner",
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
        name_en=f"{org_name} Grill",
        business_type="Restaurant",
        is_active=True,
    )
    session.add_all([mem, biz])
    await session.flush()

    branch = Branch(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Skyline Branch",
        code="SKY01",
        is_active=True,
    )
    session.add(branch)
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch


@pytest.mark.anyio
async def test_table_transfer_moves_session_and_cleans_source():
    """Test table transfer moving active session and rotating old table QR."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        t1 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-01",
        )
        t2 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-02",
        )
        session.add_all([t1, t2])
        await session.commit()
        t1_initial_qr = t1.qr_code_token

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Open session on T-01
            await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t1.id}/sessions/open",
                headers=headers,
                json={"guest_count": 2},
            )

            # 2. Transfer T-01 -> T-02
            transfer_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t1.id}/transfer",
                headers=headers,
                json={
                    "target_table_id": str(t2.id),
                    "reason": "Moved to non-smoking area",
                    "auto_clean_source": True,
                },
            )
            assert transfer_resp.status_code == status.HTTP_200_OK
            data = transfer_resp.json()
            assert data["table_id"] == str(t2.id)
            assert data["table_number"] == "T-02"
            assert "Transferred from T-01" in data["notes"]

            # 3. Verify T-01 is dirty_cleaning and physical QR token is permanent
            t1_check = (
                await client.get(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t1.id}",
                    headers=headers,
                )
            ).json()
            assert t1_check["status"] == "dirty_cleaning"
            assert t1_check["qr_code_token"] == t1_initial_qr

            # 4. Verify T-02 is occupied
            t2_check = (
                await client.get(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t2.id}",
                    headers=headers,
                )
            ).json()
            assert t2_check["status"] == "occupied"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_transfer_to_occupied_table_returns_409_conflict():
    """Test transfer is blocked if target table is already occupied."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        t1 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-01",
        )
        t2 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-02",
        )
        session.add_all([t1, t2])
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # Open session on both tables
            await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t1.id}/sessions/open",
                headers=headers,
                json={"guest_count": 2},
            )
            await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t2.id}/sessions/open",
                headers=headers,
                json={"guest_count": 4},
            )

            # Transfer T-01 -> T-02 should return 409
            conflict_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t1.id}/transfer",
                headers=headers,
                json={"target_table_id": str(t2.id)},
            )
            assert conflict_resp.status_code == status.HTTP_409_CONFLICT

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_table_merging_and_unmerging():
    """Test merging secondary tables into primary session and unmerging."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        t1 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-01",
        )
        t2 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-02",
        )
        t3 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-03",
        )
        session.add_all([t1, t2, t3])
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Merge T-02 and T-03 into T-01
            merge_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t1.id}/merge",
                headers=headers,
                json={
                    "secondary_table_ids": [str(t2.id), str(t3.id)],
                    "notes": "Large family party",
                },
            )
            assert merge_resp.status_code == status.HTTP_200_OK
            merge_data = merge_resp.json()
            assert "T-02" in merge_data["merged_table_numbers"]
            assert "T-03" in merge_data["merged_table_numbers"]

            # 2. Check T-02 and T-03 are occupied
            t2_res = (
                await client.get(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t2.id}",
                    headers=headers,
                )
            ).json()
            assert t2_res["status"] == "occupied"

            # 3. Unmerge T-02
            unmerge_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t1.id}/unmerge",
                headers=headers,
                json={"secondary_table_ids": [str(t2.id)]},
            )
            assert unmerge_resp.status_code == status.HTTP_200_OK

            # 4. T-02 is now available
            t2_after = (
                await client.get(
                    f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t2.id}",
                    headers=headers,
                )
            ).json()
            assert t2_after["status"] == "available"

        app.dependency_overrides.clear()

    await engine.dispose()
