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
from app.models.enums import (
    BillingCycle,
    OrganizationStatus,
    SubscriptionStatus,
    UserStatus,
)
from app.models.organization import Organization
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def admin_plan_setup():
    """Seeds test database with super admin, standard owner, plans, and subscribers."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        # 1. Super Admin
        admin_user = User(
            email="superadmin@emenu.platform",
            phone="+85510000001",
            full_name="Master Platform Admin",
            password_hash=hash_password("SuperSecure123!"),
            status=UserStatus.ACTIVE,
            is_platform_admin=True,
        )
        # 2. Regular Owner
        owner_user = User(
            email="owner@phnompenh.com",
            phone="+85512777888",
            full_name="Bistro Owner",
            password_hash=hash_password("OwnerPassword123!"),
            status=UserStatus.ACTIVE,
            is_platform_admin=False,
        )
        session.add_all([admin_user, owner_user])

        # 3. Base Plans
        free_plan = Plan(
            name="Starter Free",
            code="free_tier",
            price_usd_monthly=Decimal("0.00"),
            price_usd_annually=Decimal("0.00"),
            max_branches=1,
            max_staff=3,
            feature_flags={"has_kds": False, "has_inventory": False, "has_analytics": False},
        )
        pro_plan = Plan(
            name="Pro Multi-Outlet",
            code="pro_tier",
            price_usd_monthly=Decimal("29.00"),
            price_usd_annually=Decimal("290.00"),
            max_branches=5,
            max_staff=20,
            feature_flags={"has_kds": True, "has_inventory": True, "has_analytics": True},
        )
        session.add_all([free_plan, pro_plan])
        await session.flush()

        # 4. Organizations Subscribed
        now_utc = datetime.now(timezone.utc)
        org1 = Organization(
            name="Angkor Group",
            slug="angkor-group",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        org2 = Organization(
            name="Bayon Hospitality",
            slug="bayon-hospitality",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([org1, org2])
        await session.flush()

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
            plan_id=pro_plan.id,
            status=SubscriptionStatus.TRIAL,
            billing_cycle=BillingCycle.TRIAL,
            current_period_starts_at=now_utc,
            current_period_ends_at=now_utc + timedelta(days=14),
        )
        session.add_all([sub1, sub2])
        await session.commit()

        yield {
            "engine": engine,
            "sessionmaker": sessionmaker,
            "admin_user_id": admin_user.id,
            "owner_user_id": owner_user.id,
            "free_plan_id": free_plan.id,
            "pro_plan_id": pro_plan.id,
        }

    await engine.dispose()


@pytest.mark.anyio
async def test_unauthorized_user_forbidden_from_admin_plans(admin_plan_setup):
    """Verifies that non-super-admin users receive 403 Forbidden on /api/v1/admin/plans."""
    token = create_access_token(user_id=admin_plan_setup["owner_user_id"])

    async def _override_get_db():
        async with admin_plan_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res1 = await ac.get(
            "/api/v1/admin/plans",
            headers={"Authorization": f"Bearer {token}"},
        )
        res2 = await ac.post(
            "/api/v1/admin/plans",
            json={"code": "hacker_tier", "name": "Hacker Tier"},
            headers={"Authorization": f"Bearer {token}"},
        )

    app.dependency_overrides.clear()

    assert res1.status_code == 403
    assert res2.status_code == 403


@pytest.mark.anyio
async def test_admin_list_and_inspect_plans(admin_plan_setup):
    """Verifies Super Admin listing plans with active subscribers and deep plan inspection."""
    token = create_access_token(user_id=admin_plan_setup["admin_user_id"])
    pro_plan_id = admin_plan_setup["pro_plan_id"]

    async def _override_get_db():
        async with admin_plan_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. List all plans
        res = await ac.get(
            "/api/v1/admin/plans",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 2
        pro_item = next(p for p in data if p["code"] == "pro_tier")
        assert pro_item["active_subscribers_count"] == 2
        assert float(pro_item["price_usd_monthly"]) == 29.00

        # 2. Deep plan inspection
        res_detail = await ac.get(
            f"/api/v1/admin/plans/{pro_plan_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_detail.status_code == 200
        detail_data = res_detail.json()
        assert detail_data["code"] == "pro_tier"
        assert len(detail_data["subscribers"]) == 2

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_create_plan_with_feature_flags(admin_plan_setup):
    """Verifies creating a new subscription plan with custom feature flags and unique code enforcement."""
    token = create_access_token(user_id=admin_plan_setup["admin_user_id"])

    async def _override_get_db():
        async with admin_plan_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Create Enterprise Unlimited Plan
        res_create = await ac.post(
            "/api/v1/admin/plans",
            json={
                "code": "enterprise_tier",
                "name": "Enterprise Unlimited",
                "description": "Unlimited branches, KDS stations, and advanced franchise analytics",
                "price_usd_monthly": 99.00,
                "price_usd_annually": 990.00,
                "max_branches": -1,
                "max_staff": -1,
                "feature_flags": {
                    "has_kds": True,
                    "has_inventory": True,
                    "has_analytics": True,
                    "max_tables": -1,
                    "max_menu_items": -1,
                },
                "is_active": True,
                "is_public": True,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_create.status_code == 201
        created_data = res_create.json()
        assert created_data["code"] == "enterprise_tier"
        assert float(created_data["price_usd_monthly"]) == 99.00
        assert created_data["feature_flags"]["has_kds"] is True

        # 2. Duplicate Code should be rejected (409 Conflict)
        res_dup = await ac.post(
            "/api/v1/admin/plans",
            json={
                "code": "enterprise_tier",
                "name": "Duplicate Plan",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_dup.status_code == 409
        assert "already exists" in res_dup.json()["detail"]

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_update_plan_pricing_and_limits(admin_plan_setup):
    """Verifies updating subscription plan pricing and feature gates."""
    token = create_access_token(user_id=admin_plan_setup["admin_user_id"])
    pro_plan_id = admin_plan_setup["pro_plan_id"]

    async def _override_get_db():
        async with admin_plan_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res_update = await ac.patch(
            f"/api/v1/admin/plans/{pro_plan_id}",
            json={
                "name": "Pro Multi-Outlet Plus",
                "price_usd_monthly": 35.00,
                "max_branches": 8,
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_update.status_code == 200
        updated_data = res_update.json()
        assert updated_data["name"] == "Pro Multi-Outlet Plus"
        assert float(updated_data["price_usd_monthly"]) == 35.00
        assert updated_data["max_branches"] == 8

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_archive_plan(admin_plan_setup):
    """Verifies soft archiving a subscription plan tier."""
    token = create_access_token(user_id=admin_plan_setup["admin_user_id"])
    free_plan_id = admin_plan_setup["free_plan_id"]

    async def _override_get_db():
        async with admin_plan_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res_archive = await ac.delete(
            f"/api/v1/admin/plans/{free_plan_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_archive.status_code == 200
        archived_data = res_archive.json()
        assert archived_data["is_active"] is False
        assert archived_data["is_public"] is False

    app.dependency_overrides.clear()
