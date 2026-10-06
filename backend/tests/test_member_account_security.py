"""Regression tests: staff management must not take over or escalate accounts."""

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password, verify_password
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.enums import MembershipStatus, StaffRole, UserStatus
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
VICTIM_PASSWORD = "owner_password123"


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def _client_for(session) -> AsyncClient:
    async def _override_db():
        yield session

    app.dependency_overrides[get_db_session] = _override_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.anyio
async def test_invite_never_changes_existing_account_credentials():
    """Inviting another tenant's user, then accepting the invite, keeps their password."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        victim, _, _, _ = await setup_test_tenant(
            session, org_name="Victim Org", email="victim@example.com"
        )
        attacker, attacker_org, _, _ = await setup_test_tenant(
            session, org_name="Attacker Org", email="attacker@example.com"
        )
        headers = {"Authorization": f"Bearer {create_access_token(attacker.id)}"}

        try:
            async with await _client_for(session) as client:
                invite = await client.post(
                    f"/api/v1/organizations/{attacker_org.id}/members/invite",
                    headers=headers,
                    json={
                        "email": "victim@example.com",
                        "full_name": "Anyone",
                        "role": "waiter",
                        "password": "attacker-chosen-pass",
                    },
                )
                assert invite.status_code == status.HTTP_201_CREATED
                assert invite.json()["status"] == MembershipStatus.INVITED.value

                invite_token = invite.json()["invitation_token"]

                # The inviter holds the token, but the token alone cannot accept
                # on behalf of an existing account.
                token_only = await client.post(
                    "/api/v1/auth/invitations/accept",
                    json={
                        "token": invite_token,
                        "password": "attacker-chosen-pass-2",
                        "full_name": "Renamed By Attacker",
                    },
                )
                assert token_only.status_code == status.HTTP_403_FORBIDDEN

                # Signed in as someone else, the token is still refused.
                as_inviter = await client.post(
                    "/api/v1/auth/invitations/accept-existing",
                    headers=headers,
                    json={"token": invite_token},
                )
                assert as_inviter.status_code == status.HTTP_403_FORBIDDEN

                await session.refresh(victim)
                assert victim.full_name == "Test Owner"
                assert verify_password(VICTIM_PASSWORD, victim.password_hash)
                assert not verify_password("attacker-chosen-pass", victim.password_hash)
                assert not verify_password(
                    "attacker-chosen-pass-2", victim.password_hash
                )

                # The account owner, signed in, can accept.
                as_owner = await client.post(
                    "/api/v1/auth/invitations/accept-existing",
                    headers={
                        "Authorization": f"Bearer {create_access_token(victim.id)}"
                    },
                    json={"token": invite_token},
                )
                assert as_owner.status_code == status.HTTP_200_OK
                assert as_owner.json()["status"] == MembershipStatus.ACTIVE.value
        finally:
            app.dependency_overrides.clear()

        await session.refresh(victim)
        assert verify_password(VICTIM_PASSWORD, victim.password_hash)
        assert victim.status == UserStatus.ACTIVE


@pytest.mark.anyio
async def test_pending_invitee_cannot_be_claimed_by_another_organization():
    """An unclaimed invited account cannot be invited (and claimed) by a second org."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner_a, org_a, _, _ = await setup_test_tenant(
            session, org_name="Org A", email="a-owner@example.com"
        )
        owner_b, org_b, _, _ = await setup_test_tenant(
            session, org_name="Org B", email="b-owner@example.com"
        )
        payload = {
            "email": "newhire@example.com",
            "full_name": "New Hire",
            "role": "waiter",
        }

        try:
            async with await _client_for(session) as client:
                first = await client.post(
                    f"/api/v1/organizations/{org_a.id}/members/invite",
                    headers={
                        "Authorization": f"Bearer {create_access_token(owner_a.id)}"
                    },
                    json=payload,
                )
                assert first.status_code == status.HTTP_201_CREATED

                second = await client.post(
                    f"/api/v1/organizations/{org_b.id}/members/invite",
                    headers={
                        "Authorization": f"Bearer {create_access_token(owner_b.id)}"
                    },
                    json={**payload, "password": "b-chosen-password"},
                )
                assert second.status_code == status.HTTP_409_CONFLICT
        finally:
            app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_manager_cannot_escalate_to_owner_or_grant_privileged_roles():
    """Managers cannot promote themselves, promote others, or invite owners."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        _, org, _, _ = await setup_test_tenant(session)

        manager = User(
            email="manager@example.com",
            password_hash=hash_password("manager_password123"),
            full_name="Branch Manager",
            status=UserStatus.ACTIVE,
            is_verified=True,
        )
        waiter = User(
            email="waiter@example.com",
            password_hash=hash_password("waiter_password123"),
            full_name="Floor Waiter",
            status=UserStatus.ACTIVE,
            is_verified=True,
        )
        session.add_all([manager, waiter])
        await session.flush()
        manager_mem = OrganizationMembership(
            organization_id=org.id,
            user_id=manager.id,
            role=StaffRole.MANAGER,
            status=MembershipStatus.ACTIVE,
            is_owner=False,
        )
        waiter_mem = OrganizationMembership(
            organization_id=org.id,
            user_id=waiter.id,
            role=StaffRole.WAITER,
            status=MembershipStatus.ACTIVE,
            is_owner=False,
        )
        session.add_all([manager_mem, waiter_mem])
        await session.commit()

        headers = {"Authorization": f"Bearer {create_access_token(manager.id)}"}
        try:
            async with await _client_for(session) as client:
                promote_self = await client.patch(
                    f"/api/v1/organizations/{org.id}/members/{manager_mem.id}",
                    headers=headers,
                    json={"role": "owner"},
                )
                assert promote_self.status_code == status.HTTP_403_FORBIDDEN

                promote_other = await client.patch(
                    f"/api/v1/organizations/{org.id}/members/{waiter_mem.id}",
                    headers=headers,
                    json={"role": "manager"},
                )
                assert promote_other.status_code == status.HTTP_403_FORBIDDEN

                invite_owner = await client.post(
                    f"/api/v1/organizations/{org.id}/members/invite",
                    headers=headers,
                    json={
                        "email": "coowner@example.com",
                        "full_name": "Co Owner",
                        "role": "owner",
                    },
                )
                assert invite_owner.status_code == status.HTTP_403_FORBIDDEN

                # Ordinary staff changes by a manager still work.
                retitle = await client.patch(
                    f"/api/v1/organizations/{org.id}/members/{waiter_mem.id}",
                    headers=headers,
                    json={"job_title": "Senior Waiter"},
                )
                assert retitle.status_code == status.HTTP_200_OK
        finally:
            app.dependency_overrides.clear()

        await session.refresh(manager_mem)
        assert manager_mem.role == StaffRole.MANAGER
        assert manager_mem.is_owner is False


@pytest.mark.anyio
async def test_org_cannot_rewrite_identity_of_shared_account():
    """A tenant cannot change the email of an account that belongs to another org."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        victim, _, _, _ = await setup_test_tenant(
            session, org_name="Victim Org", email="victim@example.com"
        )
        attacker, attacker_org, _, _ = await setup_test_tenant(
            session, org_name="Attacker Org", email="attacker@example.com"
        )
        headers = {"Authorization": f"Bearer {create_access_token(attacker.id)}"}

        try:
            async with await _client_for(session) as client:
                invite = await client.post(
                    f"/api/v1/organizations/{attacker_org.id}/members/invite",
                    headers=headers,
                    json={
                        "email": "victim@example.com",
                        "full_name": "Victim",
                        "role": "waiter",
                    },
                )
                assert invite.status_code == status.HTTP_201_CREATED

                rewrite = await client.patch(
                    f"/api/v1/organizations/{attacker_org.id}/members/{invite.json()['member_id']}",
                    headers=headers,
                    json={"email": "attacker-controlled@example.com"},
                )
                assert rewrite.status_code == status.HTTP_403_FORBIDDEN
        finally:
            app.dependency_overrides.clear()

        await session.refresh(victim)
        assert victim.email == "victim@example.com"


@pytest.mark.anyio
async def test_invite_password_must_meet_the_login_minimum():
    """A password shorter than login's 8-character minimum would lock the staff out."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, _, _ = await setup_test_tenant(session)
        headers = {"Authorization": f"Bearer {create_access_token(owner.id)}"}
        url = f"/api/v1/organizations/{org.id}/members/invite"
        staff = {
            "email": "cashier@example.com",
            "full_name": "Cashier",
            "role": "cashier",
        }

        try:
            async with await _client_for(session) as client:
                too_short = await client.post(
                    url, headers=headers, json={**staff, "password": "1234567"}
                )
                assert too_short.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

                accepted = await client.post(
                    url, headers=headers, json={**staff, "password": "12345678x"}
                )
                assert accepted.status_code == status.HTTP_201_CREATED
        finally:
            app.dependency_overrides.clear()
