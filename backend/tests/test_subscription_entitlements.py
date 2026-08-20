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
    session, org_name="Subscription Test Org", email="owner@example.com"
):
    """Helper to setup user, org, business, branch, and ensure subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Subscription Owner",
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
        name_en=f"{org_name} Business",
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
async def test_owner_registration_auto_provisions_trial():
    """
    Test that registering an owner auto-creates a 30-day Standard trial subscription.
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        await ensure_default_plans(session)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Register owner
            reg_resp = await client.post(
                "/api/v1/auth/register-owner",
                json={
                    "email": "freshowner@example.com",
                    "password": "Password123!",
                    "full_name": "Fresh Owner",
                    "organization_name": "Fresh Restaurant",
                    "organization_slug": "fresh-rest-01",
                    "business_name_en": "Fresh Rest En",
                    "business_type": "Restaurant",
                    "branch_name_en": "Main",
                    "branch_code": "MAIN",
                },
            )
            assert reg_resp.status_code == status.HTTP_201_CREATED
            org_id = reg_resp.json()["organization_id"]

            # 2. Login to get token
            login_resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "identifier": "freshowner@example.com",
                    "password": "Password123!",
                },
            )
            assert login_resp.status_code == status.HTTP_200_OK
            token = login_resp.json()["access_token"]

            # 3. View subscription status
            sub_resp = await client.get(
                f"/api/v1/organizations/{org_id}/subscription",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert sub_resp.status_code == status.HTTP_200_OK
            sub_data = sub_resp.json()
            assert sub_data["status"] == "trial"
            assert sub_data["plan"]["code"] == "standard"
            assert sub_data["days_remaining_in_trial"] is not None
            assert sub_data["days_remaining_in_trial"] >= 29
            assert sub_data["current_branch_count"] == 1
            assert sub_data["current_staff_count"] == 1

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_list_subscription_plans():
    """Test retrieving public subscription plans."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        await ensure_default_plans(session)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/plans")
            assert resp.status_code == status.HTTP_200_OK
            plans = resp.json()
            assert len(plans) >= 3
            codes = [p["code"] for p in plans]
            assert "starter" in codes
            assert "standard" in codes
            assert "growth" in codes

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_branch_limit_entitlement_enforcement():
    """Test that creating branches beyond the plan limit is blocked with 403."""
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

            # Downgrade to Starter plan (max_branches = 1)
            down_resp = await client.post(
                f"/api/v1/organizations/{org.id}/subscription/change-plan",
                headers=headers,
                json={"plan_code": "starter"},
            )
            assert down_resp.status_code == status.HTTP_200_OK

            # Attempt to create a 2nd branch on Starter plan (limit is 1)
            resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches",
                headers=headers,
                json={"name_en": "Second Branch", "code": "B-02"},
            )
            assert resp.status_code == status.HTTP_403_FORBIDDEN
            assert "Branch limit reached" in resp.json()["detail"]

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_staff_limit_entitlement_enforcement():
    """Test that inviting staff beyond the plan limit is blocked with 403."""
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

            # Downgrade to Starter plan (max_staff = 3)
            down_resp = await client.post(
                f"/api/v1/organizations/{org.id}/subscription/change-plan",
                headers=headers,
                json={"plan_code": "starter"},
            )
            assert down_resp.status_code == status.HTTP_200_OK

            # 1. Invite 1st staff (Total: 2/3)
            r1 = await client.post(
                f"/api/v1/organizations/{org.id}/members/invite",
                headers=headers,
                json={"email": "s1@example.com", "full_name": "Staff 1"},
            )
            assert r1.status_code == status.HTTP_201_CREATED

            # 2. Invite 2nd staff (Total: 3/3)
            r2 = await client.post(
                f"/api/v1/organizations/{org.id}/members/invite",
                headers=headers,
                json={"email": "s2@example.com", "full_name": "Staff 2"},
            )
            assert r2.status_code == status.HTTP_201_CREATED

            # 3. Attempt 3rd invite (Total would be 4/3 -> Exceeds limit!)
            r3 = await client.post(
                f"/api/v1/organizations/{org.id}/members/invite",
                headers=headers,
                json={"email": "s3@example.com", "full_name": "Staff 3"},
            )
            assert r3.status_code == status.HTTP_403_FORBIDDEN
            assert "Staff limit reached" in r3.json()["detail"]

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_upgrade_plan_and_downgrade_guard():
    """
    Test upgrading plan expands limits, and downgrading with excess resources
    is blocked.
    """
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

            # 1. Upgrade to Growth plan
            up_resp = await client.post(
                f"/api/v1/organizations/{org.id}/subscription/change-plan",
                headers=headers,
                json={"plan_code": "growth", "billing_cycle": "monthly"},
            )
            assert up_resp.status_code == status.HTTP_200_OK
            assert up_resp.json()["plan"]["code"] == "growth"
            assert up_resp.json()["plan"]["max_branches"] == 10

            # 2. Add 2nd branch under Growth plan
            b2_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches",
                headers=headers,
                json={"name_en": "Branch 2", "code": "B-02"},
            )
            assert b2_resp.status_code == status.HTTP_201_CREATED

            # 3. Try to downgrade to Starter (max 1 branch, but org has 2) -> Blocked
            down_resp = await client.post(
                f"/api/v1/organizations/{org.id}/subscription/change-plan",
                headers=headers,
                json={"plan_code": "starter"},
            )
            assert down_resp.status_code == status.HTTP_403_FORBIDDEN
            assert "Cannot switch to Starter" in down_resp.json()["detail"]

        app.dependency_overrides.clear()

    await engine.dispose()
