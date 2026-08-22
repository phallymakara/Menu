from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import (
    BillingCycle,
    MembershipStatus,
    OrganizationStatus,
    SubscriptionStatus,
    TableSessionStatus,
    UserStatus,
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.plan import Plan
from app.models.restaurant_table import RestaurantTable
from app.models.subscription import Subscription
from app.models.table_session import TableSession
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_non_admin_user_forbidden_from_platform_stats():
    """Verifies that regular organization owners or staff receive 403 Forbidden when calling /api/v1/admin/stats."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        regular_user = User(
            email="regular_owner@bistro.com",
            phone="+85512999888",
            full_name="Regular Owner",
            password_hash=hash_password("Password123!"),
            status=UserStatus.ACTIVE,
            is_platform_admin=False,
        )
        session.add(regular_user)
        await session.commit()
        regular_user_id = regular_user.id

        token = create_access_token(user_id=regular_user_id)

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(
                "/api/v1/admin/stats",
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()

    await engine.dispose()

    assert response.status_code == 403
    assert "Platform administrator privileges required" in response.json()["detail"]


@pytest.mark.anyio
async def test_super_admin_can_retrieve_platform_kpi_stats():
    """Verifies that a Super Admin (is_platform_admin=True) can retrieve platform-wide stats."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        # 1. Super Admin User
        admin_user = User(
            email="superadmin@emenu.platform",
            phone="+85510000001",
            full_name="Master Platform Admin",
            password_hash=hash_password("SuperSecure123!"),
            status=UserStatus.ACTIVE,
            is_platform_admin=True,
        )
        session.add(admin_user)

        # 2. Plan Setup (Free & Pro)
        free_plan = Plan(
            name="Starter Free",
            code="free_tier",
            price_usd_monthly=Decimal("0.00"),
            price_usd_annually=Decimal("0.00"),
            max_branches=1,
            max_staff=3,
        )
        pro_plan = Plan(
            name="Pro Multi-Outlet",
            code="pro_tier",
            price_usd_monthly=Decimal("29.00"),
            price_usd_annually=Decimal("290.00"),
            max_branches=5,
            max_staff=20,
        )
        session.add_all([free_plan, pro_plan])
        await session.flush()

        # 3. Organizations with Subscriptions
        org1 = Organization(
            name="Angkor Group",
            slug="angkor-group-test",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        org2 = Organization(
            name="Bayon Hospitality",
            slug="bayon-hospitality-test",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        org3 = Organization(
            name="Suspended Restaurant",
            slug="suspended-rest-test",
            status=OrganizationStatus.SUSPENDED,
            is_active=False,
        )
        session.add_all([org1, org2, org3])
        await session.flush()

        now_utc = datetime.now(timezone.utc)
        sub1 = Subscription(
            organization_id=org1.id,
            plan_id=pro_plan.id,
            status=SubscriptionStatus.ACTIVE,
            billing_cycle=BillingCycle.MONTHLY,
            current_period_starts_at=now_utc,
            current_period_ends_at=now_utc + timedelta(days=30),
        )
        sub2 = Subscription(
            organization_id=org2.id,
            plan_id=free_plan.id,
            status=SubscriptionStatus.TRIAL,
            billing_cycle=BillingCycle.TRIAL,
            current_period_starts_at=now_utc,
            current_period_ends_at=now_utc + timedelta(days=14),
        )
        sub3 = Subscription(
            organization_id=org3.id,
            plan_id=pro_plan.id,
            status=SubscriptionStatus.SUSPENDED,
            billing_cycle=BillingCycle.MONTHLY,
            current_period_starts_at=now_utc - timedelta(days=60),
            current_period_ends_at=now_utc - timedelta(days=30),
        )
        session.add_all([sub1, sub2, sub3])

        # 4. Businesses and Branches
        biz1 = Business(
            organization_id=org1.id,
            name_en="Angkor Bistro",
            business_type="Restaurant",
        )
        session.add(biz1)
        await session.flush()

        branch1 = Branch(
            organization_id=org1.id,
            business_id=biz1.id,
            name_en="BKK1 Branch",
            name_km="សាខាបឹងកេងកង១",
            code="BKK1",
            phone="012345678",
            is_active=True,
        )
        branch2 = Branch(
            organization_id=org1.id,
            business_id=biz1.id,
            name_en="TTP Branch",
            name_km="សាខាទួលទំពូង",
            code="TTP",
            phone="012345679",
            is_active=True,
        )
        session.add_all([branch1, branch2])
        await session.flush()

        # 5. Table & Active Session
        table1 = RestaurantTable(
            organization_id=org1.id,
            business_id=biz1.id,
            branch_id=branch1.id,
            table_number="T-01",
            name="Table 01",
            min_capacity=2,
            max_capacity=4,
        )
        session.add(table1)
        await session.flush()

        active_session = TableSession(
            organization_id=org1.id,
            business_id=biz1.id,
            branch_id=branch1.id,
            table_id=table1.id,
            session_code="SESS-999",
            session_token="token_sess_999",
            guest_count=2,
            status=TableSessionStatus.ACTIVE,
        )
        session.add(active_session)

        # 6. Staff Membership
        member1 = OrganizationMembership(
            organization_id=org1.id,
            user_id=admin_user.id,
            role="owner",
            status=MembershipStatus.ACTIVE,
            is_owner=True,
        )
        session.add(member1)

        await session.commit()
        admin_user_id = admin_user.id

        token = create_access_token(user_id=admin_user_id)

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(
                "/api/v1/admin/stats",
                headers={"Authorization": f"Bearer {token}"},
            )

        app.dependency_overrides.clear()

    await engine.dispose()

    assert response.status_code == 200
    data = response.json()

    # Verify high-level structures
    assert "generated_at" in data
    assert "organizations" in data
    assert "entities" in data
    assert "saas_economics" in data
    assert "subscription_distribution" in data

    # Verify organizations counters
    orgs = data["organizations"]
    assert orgs["total_organizations"] == 3
    assert orgs["active_organizations"] == 2
    assert orgs["suspended_organizations"] == 1
    assert orgs["trial_organizations"] == 1

    # Verify entities counters
    entities = data["entities"]
    assert entities["total_businesses"] == 1
    assert entities["total_branches"] == 2
    assert entities["total_active_branches"] == 2
    assert entities["total_registered_users"] == 1
    assert entities["active_table_sessions"] == 1

    # Verify SaaS economics
    economics = data["saas_economics"]
    assert float(economics["estimated_mrr_usd"]) == 29.00
    assert float(economics["estimated_arr_usd"]) == 29.00 * 12.00
    assert economics["new_tenants_last_30d"] == 3

    # Verify subscription distribution
    dist = data["subscription_distribution"]
    assert len(dist) == 2
    plan_codes = [p["plan_code"] for p in dist]
    assert "free_tier" in plan_codes
    assert "pro_tier" in plan_codes
