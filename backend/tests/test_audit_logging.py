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
    session,
    org_name="Audit Org",
    email="audit_owner@example.com",
    role=StaffRole.OWNER,
):
    """Helper to setup user, org, business, branch with subscription."""
    await ensure_default_plans(session)

    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Audit User",
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
        role=role,
        status=MembershipStatus.ACTIVE,
        is_owner=(role == StaffRole.OWNER),
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
async def test_registration_and_login_generate_audit_logs():
    """Test that owner registration and login generate audit log records."""
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
                    "email": "audit_reg@example.com",
                    "password": "Password123!",
                    "full_name": "Audit Reg Owner",
                    "organization_name": "Audit Reg Rest",
                    "organization_slug": "audit-reg-01",
                    "business_name_en": "Audit Business",
                    "business_type": "Restaurant",
                    "branch_name_en": "Main",
                    "branch_code": "MAIN",
                },
            )
            assert reg_resp.status_code == status.HTTP_201_CREATED
            org_id = reg_resp.json()["organization_id"]

            # 2. Login
            login_resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "identifier": "audit_reg@example.com",
                    "password": "Password123!",
                },
            )
            assert login_resp.status_code == status.HTTP_200_OK
            token = login_resp.json()["access_token"]

            # 3. View audit logs
            logs_resp = await client.get(
                f"/api/v1/organizations/{org_id}/audit-logs",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert logs_resp.status_code == status.HTTP_200_OK
            data = logs_resp.json()
            actions = [item["action"] for item in data["items"]]
            assert "AUTH_REGISTER" in actions

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_branch_lifecycle_audit_logs():
    """Test that creating, updating, and deleting branches records audit logs."""
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

            # 1. Create branch
            c_resp = await client.post(
                f"/api/v1/businesses/{biz.id}/branches",
                headers=headers,
                json={"name_en": "Branch 2", "code": "B2"},
            )
            assert c_resp.status_code == status.HTTP_201_CREATED
            b2_id = c_resp.json()["id"]

            # 2. Update branch
            u_resp = await client.patch(
                f"/api/v1/businesses/{biz.id}/branches/{b2_id}",
                headers=headers,
                json={"name_en": "Branch 2 Updated"},
            )
            assert u_resp.status_code == status.HTTP_200_OK

            # 3. Delete branch
            d_resp = await client.delete(
                f"/api/v1/businesses/{biz.id}/branches/{b2_id}",
                headers=headers,
            )
            assert d_resp.status_code == status.HTTP_204_NO_CONTENT

            # 4. Check audit logs
            logs_resp = await client.get(
                f"/api/v1/organizations/{org.id}/audit-logs",
                headers=headers,
            )
            assert logs_resp.status_code == status.HTTP_200_OK
            actions = [item["action"] for item in logs_resp.json()["items"]]
            assert "BRANCH_CREATED" in actions
            assert "BRANCH_UPDATED" in actions
            assert "BRANCH_DELETED" in actions

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_staff_invitation_audit_logs():
    """Test audit log generation on staff invitation, accept, update, and revoke."""
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

            # 1. Invite staff
            inv_resp = await client.post(
                f"/api/v1/organizations/{org.id}/members/invite",
                headers=headers,
                json={
                    "email": "staff_aud@example.com",
                    "full_name": "Audit Cashier",
                    "role": "cashier",
                },
            )
            assert inv_resp.status_code == status.HTTP_201_CREATED
            inv_token = inv_resp.json()["invitation_token"]

            # 2. Accept invite
            acc_resp = await client.post(
                "/api/v1/auth/invitations/accept",
                json={
                    "token": inv_token,
                    "password": "Password123!",
                    "full_name": "Audit Cashier",
                },
            )
            assert acc_resp.status_code == status.HTTP_200_OK
            member_id = acc_resp.json()["id"]

            # 3. Update staff role
            up_resp = await client.patch(
                f"/api/v1/organizations/{org.id}/members/{member_id}",
                headers=headers,
                json={"role": "waiter"},
            )
            assert up_resp.status_code == status.HTTP_200_OK

            # 4. Revoke staff
            rev_resp = await client.delete(
                f"/api/v1/organizations/{org.id}/members/{member_id}",
                headers=headers,
            )
            assert rev_resp.status_code == status.HTTP_204_NO_CONTENT

            # 5. Check audit logs
            logs_resp = await client.get(
                f"/api/v1/organizations/{org.id}/audit-logs",
                headers=headers,
            )
            assert logs_resp.status_code == status.HTTP_200_OK
            actions = [item["action"] for item in logs_resp.json()["items"]]
            assert "STAFF_INVITED" in actions
            assert "STAFF_INVITATION_ACCEPTED" in actions
            assert "STAFF_UPDATED" in actions
            assert "STAFF_REVOKED" in actions

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_audit_logs_filtering_and_permissions():
    """Test filtering audit logs and verifying non-admin access is blocked."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(user.id)

        # Create a waiter user in the same org
        waiter = User(
            email="waiter_audit@example.com",
            password_hash=hash_password("pw12345678"),
            full_name="Audit Waiter",
            status=UserStatus.ACTIVE,
            is_verified=True,
        )
        session.add(waiter)
        await session.flush()
        waiter_mem = OrganizationMembership(
            organization_id=org.id,
            user_id=waiter.id,
            role=StaffRole.WAITER,
            status=MembershipStatus.ACTIVE,
            is_owner=False,
        )
        session.add(waiter_mem)
        await session.commit()
        waiter_token = create_access_token(waiter.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Waiter cannot access audit logs (403 Forbidden)
            w_resp = await client.get(
                f"/api/v1/organizations/{org.id}/audit-logs",
                headers={"Authorization": f"Bearer {waiter_token}"},
            )
            assert w_resp.status_code == status.HTTP_403_FORBIDDEN

            # 2. Owner can filter by action
            f_resp = await client.get(
                f"/api/v1/organizations/{org.id}/audit-logs?action=BRANCH_CREATED",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert f_resp.status_code == status.HTTP_200_OK
            items = f_resp.json()["items"]
            for item in items:
                assert item["action"] == "BRANCH_CREATED"

        app.dependency_overrides.clear()

    await engine.dispose()
