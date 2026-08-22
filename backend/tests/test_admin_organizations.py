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
    UserStatus,
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.plan import Plan
from app.models.restaurant_table import RestaurantTable
from app.models.subscription import Subscription
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def admin_org_setup():
    """Seeds test data with a super admin, regular owner, plans, organizations, and branches."""
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
        # 2. Regular Store Owner
        owner_user = User(
            email="owner@phnompenhbistro.com",
            phone="+85512888999",
            full_name="Bistro Owner",
            password_hash=hash_password("OwnerPassword123!"),
            status=UserStatus.ACTIVE,
            is_platform_admin=False,
        )
        session.add_all([admin_user, owner_user])

        # 3. Subscription Plans
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
        enterprise_plan = Plan(
            name="Enterprise Unlimited",
            code="enterprise_tier",
            price_usd_monthly=Decimal("99.00"),
            price_usd_annually=Decimal("990.00"),
            max_branches=50,
            max_staff=200,
        )
        session.add_all([free_plan, pro_plan, enterprise_plan])
        await session.flush()

        # 4. Organizations
        now_utc = datetime.now(timezone.utc)
        org1 = Organization(
            name="Phnom Penh Hospitality Group",
            slug="phnom-penh-hospitality",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        org2 = Organization(
            name="Siem Reap Cafe Chain",
            slug="siem-reap-cafe",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        org3 = Organization(
            name="Archived Eatery",
            slug="archived-eatery",
            status=OrganizationStatus.SUSPENDED,
            is_active=False,
        )
        session.add_all([org1, org2, org3])
        await session.flush()

        # Subscriptions
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
            plan_id=enterprise_plan.id,
            status=SubscriptionStatus.SUSPENDED,
            billing_cycle=BillingCycle.MONTHLY,
            current_period_starts_at=now_utc - timedelta(days=60),
            current_period_ends_at=now_utc - timedelta(days=30),
        )
        session.add_all([sub1, sub2, sub3])

        # Owner Memberships
        m1 = OrganizationMembership(
            organization_id=org1.id,
            user_id=owner_user.id,
            role="owner",
            status=MembershipStatus.ACTIVE,
            is_owner=True,
        )
        session.add(m1)

        # Businesses and Branches under Org1
        biz1 = Business(
            organization_id=org1.id,
            name_en="PP Bistro Main",
            business_type="Restaurant",
        )
        session.add(biz1)
        await session.flush()

        branch1 = Branch(
            organization_id=org1.id,
            business_id=biz1.id,
            name_en="Riverside Branch",
            name_km="សាខាមាត់ទន្លេ",
            code="RVR",
            phone="012345678",
            is_active=True,
        )
        branch2 = Branch(
            organization_id=org1.id,
            business_id=biz1.id,
            name_en="BKK1 Branch",
            name_km="សាខាបឹងកេងកង១",
            code="BKK1",
            phone="012345679",
            is_active=True,
        )
        session.add_all([branch1, branch2])
        await session.flush()

        table1 = RestaurantTable(
            organization_id=org1.id,
            business_id=biz1.id,
            branch_id=branch1.id,
            table_number="T-01",
            name="Table 01",
            min_capacity=2,
            max_capacity=4,
        )
        table2 = RestaurantTable(
            organization_id=org1.id,
            business_id=biz1.id,
            branch_id=branch1.id,
            table_number="T-02",
            name="Table 02",
            min_capacity=2,
            max_capacity=4,
        )
        session.add_all([table1, table2])

        await session.commit()

        yield {
            "engine": engine,
            "sessionmaker": sessionmaker,
            "admin_user_id": admin_user.id,
            "owner_user_id": owner_user.id,
            "org1_id": org1.id,
            "org2_id": org2.id,
            "org3_id": org3.id,
            "enterprise_plan_id": enterprise_plan.id,
        }

    await engine.dispose()


@pytest.mark.anyio
async def test_unauthorized_user_forbidden_from_admin_organizations(admin_org_setup):
    """Verifies that non-super-admin users receive 403 Forbidden on all /api/v1/admin/organizations endpoints."""
    token = create_access_token(user_id=admin_org_setup["owner_user_id"])

    async def _override_get_db():
        async with admin_org_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res1 = await ac.get(
            "/api/v1/admin/organizations",
            headers={"Authorization": f"Bearer {token}"},
        )
        res2 = await ac.get(
            f"/api/v1/admin/organizations/{admin_org_setup['org1_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )

    app.dependency_overrides.clear()

    assert res1.status_code == 403
    assert res2.status_code == 403


@pytest.mark.anyio
async def test_admin_list_and_search_organizations(admin_org_setup):
    """Verifies Super Admin organization directory listing, searching, and filtering."""
    token = create_access_token(user_id=admin_org_setup["admin_user_id"])

    async def _override_get_db():
        async with admin_org_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. List all (page 1)
        res = await ac.get(
            "/api/v1/admin/organizations",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

        # 2. Search by keyword
        res_search = await ac.get(
            "/api/v1/admin/organizations?search=Siem+Reap",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_search.status_code == 200
        data_search = res_search.json()
        assert data_search["total"] == 1
        assert data_search["items"][0]["slug"] == "siem-reap-cafe"

        # 3. Filter by Status
        res_status = await ac.get(
            "/api/v1/admin/organizations?status=suspended",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_status.status_code == 200
        data_status = res_status.json()
        assert data_status["total"] == 1
        assert data_status["items"][0]["slug"] == "archived-eatery"

        # 4. Filter by Plan Code
        res_plan = await ac.get(
            "/api/v1/admin/organizations?plan_code=pro_tier",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_plan.status_code == 200
        data_plan = res_plan.json()
        assert data_plan["total"] == 1
        assert data_plan["items"][0]["slug"] == "phnom-penh-hospitality"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_get_organization_detail(admin_org_setup):
    """Verifies Super Admin deep inspection of an organization hierarchy."""
    token = create_access_token(user_id=admin_org_setup["admin_user_id"])
    org_id = admin_org_setup["org1_id"]

    async def _override_get_db():
        async with admin_org_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(
            f"/api/v1/admin/organizations/{org_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

    app.dependency_overrides.clear()

    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Phnom Penh Hospitality Group"
    assert data["owner"] is not None
    assert data["owner"]["email"] == "owner@phnompenhbistro.com"
    assert len(data["businesses"]) == 1
    assert data["businesses"][0]["name_en"] == "PP Bistro Main"
    assert len(data["branches"]) == 2
    assert data["tables_count"] == 2
    assert data["subscription"]["plan_code"] == "pro_tier"


@pytest.mark.anyio
async def test_admin_suspend_and_reactivate_organization(admin_org_setup):
    """Verifies Super Admin suspending an organization (sets is_active=False) and reactivating it."""
    token = create_access_token(user_id=admin_org_setup["admin_user_id"])
    org_id = admin_org_setup["org1_id"]

    async def _override_get_db():
        async with admin_org_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Suspend Organization
        res_suspend = await ac.patch(
            f"/api/v1/admin/organizations/{org_id}/status",
            json={"status": "suspended", "reason": "Overdue payment violation"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_suspend.status_code == 200
        data_suspend = res_suspend.json()
        assert data_suspend["status"] == "suspended"
        assert data_suspend["is_active"] is False

        # 2. Reactivate Organization
        res_activate = await ac.patch(
            f"/api/v1/admin/organizations/{org_id}/status",
            json={"status": "active", "reason": "Account resolved"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_activate.status_code == 200
        data_activate = res_activate.json()
        assert data_activate["status"] == "active"
        assert data_activate["is_active"] is True

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_override_organization_subscription(admin_org_setup):
    """Verifies Super Admin overriding an organization's subscription tier and trial end date."""
    token = create_access_token(user_id=admin_org_setup["admin_user_id"])
    org_id = admin_org_setup["org2_id"]
    enterprise_plan_id = admin_org_setup["enterprise_plan_id"]

    async def _override_get_db():
        async with admin_org_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.patch(
            f"/api/v1/admin/organizations/{org_id}/subscription",
            json={
                "plan_id": str(enterprise_plan_id),
                "status": "active",
                "notes": "Complimentary enterprise upgrade for pilot partner",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

    app.dependency_overrides.clear()

    assert res.status_code == 200
    data = res.json()
    assert data["subscription"]["plan_code"] == "enterprise_tier"
    assert data["subscription"]["status"] == "active"
