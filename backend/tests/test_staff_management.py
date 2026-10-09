from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
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

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def setup_test_tenant(
    session,
    org_name="Staff Test Org",
    email="owner@example.com",
    role=StaffRole.OWNER,
    is_owner=True,
):
    """
    Helper to create a test user, organization, membership, business, and branch.
    """
    user = User(
        email=email,
        password_hash=hash_password("owner_password123"),
        full_name="Test Owner",
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
        is_owner=is_owner,
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
        name_en="Primary Branch",
        code="B-01",
        is_active=True,
    )
    session.add(branch)
    await session.commit()

    return user, org, biz, branch


@pytest.mark.anyio
async def test_owner_can_invite_staff_member():
    """Test inviting a staff member with role and branch assignment."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(owner.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/organizations/{org.id}/members/invite",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "email": "waiter@example.com",
                    "full_name": "Sokha Waiter",
                    "role": "waiter",
                    "branch_id": str(branch.id),
                    "job_title": "Head Waiter",
                },
            )

        app.dependency_overrides.clear()

        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert data["email"] == "waiter@example.com"
        assert data["role"] == "waiter"
        assert data["status"] == "invited"
        assert "invitation_token" in data
        assert len(data["invitation_token"]) > 20

    await engine.dispose()


@pytest.mark.anyio
async def test_invite_and_accept_invitation_flow():
    """Test full invitation flow: invite -> accept with password -> login."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(owner.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Send invite
            invite_resp = await client.post(
                f"/api/v1/organizations/{org.id}/members/invite",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "email": "cashier@example.com",
                    "full_name": "Bopha Cashier",
                    "role": "cashier",
                    "branch_id": str(branch.id),
                },
            )
            assert invite_resp.status_code == status.HTTP_201_CREATED
            raw_token = invite_resp.json()["invitation_token"]

            # 2. Accept invite and set password
            accept_resp = await client.post(
                "/api/v1/auth/invitations/accept",
                json={
                    "token": raw_token,
                    "password": "SecurePassword123!",
                    "full_name": "Bopha Cashier Updated",
                },
            )
            assert accept_resp.status_code == status.HTTP_200_OK
            accept_data = accept_resp.json()
            assert accept_data["status"] == "active"
            assert accept_data["role"] == "cashier"
            assert accept_data["full_name"] == "Bopha Cashier Updated"

            # 3. Newly activated staff can log in
            login_resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "identifier": "cashier@example.com",
                    "password": "SecurePassword123!",
                },
            )
            assert login_resp.status_code == status.HTTP_200_OK
            assert "access_token" in login_resp.json()

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_list_members_with_filters():
    """Test listing members and filtering by role and status."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(owner.id)

        # Create another user + membership
        waiter = User(
            email="w1@example.com",
            password_hash="pwd",
            full_name="Waiter 1",
            status=UserStatus.ACTIVE,
        )
        session.add(waiter)
        await session.flush()

        waiter_mem = OrganizationMembership(
            organization_id=org.id,
            user_id=waiter.id,
            role=StaffRole.WAITER,
            status=MembershipStatus.ACTIVE,
            branch_id=branch.id,
        )
        session.add(waiter_mem)
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # List all
            resp_all = await client.get(
                f"/api/v1/organizations/{org.id}/members",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp_all.status_code == status.HTTP_200_OK
            assert len(resp_all.json()) == 2

            # Filter by role=waiter
            resp_waiter = await client.get(
                f"/api/v1/organizations/{org.id}/members?role=waiter",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp_waiter.status_code == status.HTTP_200_OK
            assert len(resp_waiter.json()) == 1
            assert resp_waiter.json()[0]["role"] == "waiter"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_update_and_revoke_staff_member():
    """Test updating staff role/branch and terminating membership."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(owner.id)

        staff = User(
            email="staff@example.com",
            password_hash="pwd",
            full_name="Staff Person",
            status=UserStatus.ACTIVE,
        )
        session.add(staff)
        await session.flush()

        staff_mem = OrganizationMembership(
            organization_id=org.id,
            user_id=staff.id,
            role=StaffRole.WAITER,
            status=MembershipStatus.ACTIVE,
        )
        session.add(staff_mem)
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Update role to manager & assign branch
            patch_resp = await client.patch(
                f"/api/v1/organizations/{org.id}/members/{staff_mem.id}",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "role": "manager",
                    "branch_id": str(branch.id),
                    "job_title": "Floor Manager",
                },
            )
            assert patch_resp.status_code == status.HTTP_200_OK
            updated = patch_resp.json()
            assert updated["role"] == "manager"
            assert updated["branch_id"] == str(branch.id)
            assert updated["job_title"] == "Floor Manager"

            # 2. Revoke membership
            del_resp = await client.delete(
                f"/api/v1/organizations/{org.id}/members/{staff_mem.id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert del_resp.status_code == status.HTTP_204_NO_CONTENT

            # 3. Check status is now terminated
            get_resp = await client.get(
                f"/api/v1/organizations/{org.id}/members/{staff_mem.id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert get_resp.status_code == status.HTTP_200_OK
            assert get_resp.json()["status"] == "terminated"

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_non_admin_permission_denied():
    """Test that a regular waiter cannot invite or modify staff members."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        waiter, org, biz, branch = await setup_test_tenant(
            session,
            email="regular_waiter@example.com",
            role=StaffRole.WAITER,
            is_owner=False,
        )
        token = create_access_token(waiter.id)

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/organizations/{org.id}/members/invite",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "email": "intruder@example.com",
                    "full_name": "Intruder",
                    "role": "manager",
                },
            )
            assert resp.status_code == status.HTTP_403_FORBIDDEN

        app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_pos_permissions_and_manager_pin_override():
    """Test pos_permissions metadata defaults, updating permissions, and manager PIN override."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, branch = await setup_test_tenant(session)
        token = create_access_token(owner.id)

        # Set owner PIN
        owner_mem_result = await session.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.user_id == owner.id,
            )
        )
        owner_mem = owner_mem_result.scalar_one()
        owner_mem.pos_pin = "8888"
        await session.commit()

        # Add a waiter
        waiter = User(
            email="waiter_pos@example.com",
            password_hash="pwd",
            full_name="Waiter Pos",
            status=UserStatus.ACTIVE,
        )
        session.add(waiter)
        await session.flush()

        waiter_mem = OrganizationMembership(
            organization_id=org.id,
            user_id=waiter.id,
            role=StaffRole.WAITER,
            status=MembershipStatus.ACTIVE,
            pos_pin="1234",
        )
        session.add(waiter_mem)
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Fetch member list - verify owner defaults (all true) vs waiter defaults (all false)
            list_resp = await client.get(
                f"/api/v1/organizations/{org.id}/members",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert list_resp.status_code == status.HTTP_200_OK
            members_data = list_resp.json()
            owner_entry = next(m for m in members_data if m["email"] == owner.email)
            waiter_entry = next(m for m in members_data if m["email"] == waiter.email)

            assert owner_entry["pos_permissions"]["can_void_item"] is True
            assert owner_entry["pos_permissions"]["can_cancel_order"] is True
            assert owner_entry["pos_permissions"]["can_override_price"] is True

            assert waiter_entry["pos_permissions"]["can_void_item"] is False
            assert waiter_entry["pos_permissions"]["can_cancel_order"] is False
            assert waiter_entry["pos_permissions"]["can_override_price"] is False

            # 2. Update waiter's permissions - grant can_void_item
            update_resp = await client.patch(
                f"/api/v1/organizations/{org.id}/members/{waiter_mem.id}",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "pos_permissions": {
                        "can_void_item": True,
                        "can_cancel_order": False,
                        "can_override_price": False,
                    }
                },
            )
            assert update_resp.status_code == status.HTTP_200_OK
            updated_data = update_resp.json()
            assert updated_data["pos_permissions"]["can_void_item"] is True
            assert updated_data["pos_permissions"]["can_cancel_order"] is False

            # 3. Verify manager PIN override: owner's PIN (8888) is valid
            pin_resp = await client.post(
                f"/api/v1/organizations/{org.id}/members/verify-manager-pin",
                headers={"Authorization": f"Bearer {token}"},
                json={"pin_code": "8888"},
            )
            assert pin_resp.status_code == status.HTTP_200_OK
            assert pin_resp.json()["valid"] is True
            assert pin_resp.json()["manager_name"] == owner.full_name

            # 4. Invalid PIN (0000)
            pin_invalid_resp = await client.post(
                f"/api/v1/organizations/{org.id}/members/verify-manager-pin",
                headers={"Authorization": f"Bearer {token}"},
                json={"pin_code": "0000"},
            )
            assert pin_invalid_resp.status_code == status.HTTP_200_OK
            assert pin_invalid_resp.json()["valid"] is False

        app.dependency_overrides.clear()

    await engine.dispose()
