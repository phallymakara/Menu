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
    org_name="Session Org",
    email="session_owner@example.com",
):
    """Helper to setup user, org, business, branch with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Session Owner",
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
        name_en=f"{org_name} Bistro",
        business_type="Bistro",
        is_active=True,
    )
    session.add_all([mem, biz])
    await session.flush()

    branch = Branch(
        organization_id=org.id,
        business_id=biz.id,
        name_en="Riverside Branch",
        code="RS01",
        is_active=True,
    )
    session.add(branch)
    await session.flush()

    await provision_trial_subscription(session, org.id)
    await session.commit()

    return user, org, biz, branch


@pytest.mark.anyio
async def test_staff_open_session_request_bill_and_close_with_qr_rotation():
    """Test full staff session lifecycle with status transitions and QR rotation."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        tbl = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-01",
        )
        session.add(tbl)
        await session.commit()
        initial_qr = tbl.qr_code_token

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Open session as staff
            open_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}/sessions/open",
                headers=headers,
                json={"guest_count": 3, "notes": "VIP anniversary dinner"},
            )
            assert open_resp.status_code == status.HTTP_201_CREATED
            sess_data = open_resp.json()
            assert sess_data["status"] == "active"
            assert sess_data["guest_count"] == 3
            assert sess_data["opened_by_type"] == "staff"

            # 2. Check active session endpoint
            active_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}/sessions/active",
                headers=headers,
            )
            assert active_resp.status_code == status.HTTP_200_OK
            assert active_resp.json()["id"] == sess_data["id"]

            # 3. Request bill
            bill_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}/sessions/request-bill",
                headers=headers,
            )
            assert bill_resp.status_code == status.HTTP_200_OK
            assert bill_resp.json()["status"] == "bill_requested"
            assert bill_resp.json()["bill_requested_at"] is not None

            # 4. Close session (retaining permanent physical table QR)
            close_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}/sessions/close",
                headers=headers,
                json={
                    "next_table_status": "dirty_cleaning",
                    "notes": "Paid by cash",
                },
            )
            assert close_resp.status_code == status.HTTP_200_OK
            assert close_resp.json()["status"] == "completed"
            assert close_resp.json()["closed_at"] is not None

            # Verify table status is dirty_cleaning and physical QR token is permanent
            tbl_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{tbl.id}",
                headers=headers,
            )
            assert tbl_resp.json()["status"] == "dirty_cleaning"
            assert tbl_resp.json()["qr_code_token"] == initial_qr

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_guest_qr_scan_self_open_and_bill_request():
    """Test guest self-opening table session via QR code and requesting bill."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        _, _, biz, branch = await setup_test_tenant(session)

        tbl = RestaurantTable(
            organization_id=branch.organization_id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="T-08",
        )
        session.add(tbl)
        await session.commit()
        qr_token = tbl.qr_code_token

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Guest scans QR and opens session
            guest_open = await client.post(
                f"/api/v1/public/tables/sessions/open?branch_id={branch.id}&table_id={tbl.id}&token={qr_token}",
                json={"guest_count": 2},
            )
            assert guest_open.status_code == status.HTTP_200_OK
            sess_data = guest_open.json()
            assert sess_data["status"] == "active"
            assert sess_data["opened_by_type"] == "guest"

            # 2. Re-scanning returns existing session
            reopen = await client.post(
                f"/api/v1/public/tables/sessions/open?branch_id={branch.id}&table_id={tbl.id}&token={qr_token}",
                json={"guest_count": 2},
            )
            assert reopen.status_code == status.HTTP_200_OK
            assert reopen.json()["id"] == sess_data["id"]

            # 3. Guest requests bill
            guest_bill = await client.post(
                f"/api/v1/public/tables/sessions/request-bill?branch_id={branch.id}&table_id={tbl.id}&token={qr_token}"
            )
            assert guest_bill.status_code == status.HTTP_200_OK
            assert guest_bill.json()["status"] == "bill_requested"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_live_table_dashboard_aggregation():
    """Test live table dashboard summary counters and floor grouping."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        area1 = DiningArea(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Main Hall",
            display_order=1,
        )
        area2 = DiningArea(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Terrace",
            display_order=2,
        )
        session.add_all([area1, area2])
        await session.flush()

        t1 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            dining_area_id=area1.id,
            table_number="M-01",
        )
        t2 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            dining_area_id=area2.id,
            table_number="T-01",
        )
        t3 = RestaurantTable(
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_number="U-01",
        )
        session.add_all([t1, t2, t3])
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {token}"}

            # Open session on M-01
            await client.post(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables/{t1.id}/sessions/open",
                headers=headers,
                json={"guest_count": 4},
            )

            # Get Dashboard
            dash_resp = await client.get(
                f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables-dashboard",
                headers=headers,
            )
            assert dash_resp.status_code == status.HTTP_200_OK
            dash = dash_resp.json()
            assert dash["total_tables"] == 3
            assert dash["occupied_count"] == 1
            assert dash["available_count"] == 2
            assert len(dash["areas"]) == 3  # Main Hall, Terrace, Unassigned

        app.dependency_overrides.clear()

    await engine.dispose()
