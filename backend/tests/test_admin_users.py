from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import MembershipStatus, OrganizationStatus, UserStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def admin_user_setup():
    """Seeds test data with super admin, standard owners, cashiers, and multi-tenant links."""
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
        # 2. Restaurant Owner
        owner_user = User(
            email="chef_sok@phnompenh.com",
            phone="+85512777888",
            full_name="Chef Sok",
            password_hash=hash_password("OldPassword123!"),
            status=UserStatus.ACTIVE,
            is_platform_admin=False,
        )
        # 3. Cashier Staff
        cashier_user = User(
            email="cashier_bopha@phnompenh.com",
            phone="+85512333444",
            full_name="Bopha Cashier",
            password_hash=hash_password("CashierPass123!"),
            status=UserStatus.ACTIVE,
            is_platform_admin=False,
        )
        session.add_all([admin_user, owner_user, cashier_user])
        await session.flush()

        # 4. Organization & Branch
        org = Organization(
            name="Angkor Bistro Group",
            slug="angkor-bistro-group",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add(org)
        await session.flush()

        biz = Business(
            organization_id=org.id,
            name_en="Angkor Bistro",
            business_type="Restaurant",
        )
        session.add(biz)
        await session.flush()

        branch = Branch(
            organization_id=org.id,
            business_id=biz.id,
            name_en="Riverside Outlet",
            name_km="សាខាមាត់ទន្លេ",
            code="RVR",
            phone="012345678",
            is_active=True,
        )
        session.add(branch)
        await session.flush()

        # 5. Memberships
        m1 = OrganizationMembership(
            organization_id=org.id,
            user_id=owner_user.id,
            role="owner",
            status=MembershipStatus.ACTIVE,
            is_owner=True,
        )
        m2 = OrganizationMembership(
            organization_id=org.id,
            user_id=cashier_user.id,
            branch_id=branch.id,
            role="cashier",
            status=MembershipStatus.ACTIVE,
            is_owner=False,
        )
        session.add_all([m1, m2])
        await session.commit()

        yield {
            "engine": engine,
            "sessionmaker": sessionmaker,
            "admin_user_id": admin_user.id,
            "owner_user_id": owner_user.id,
            "cashier_user_id": cashier_user.id,
            "org_id": org.id,
        }

    await engine.dispose()


@pytest.mark.anyio
async def test_unauthorized_user_forbidden_from_admin_users(admin_user_setup):
    """Verifies that non-super-admin users receive 403 Forbidden on /api/v1/admin/users."""
    token = create_access_token(user_id=admin_user_setup["owner_user_id"])

    async def _override_get_db():
        async with admin_user_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res1 = await ac.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        res2 = await ac.get(
            f"/api/v1/admin/users/{admin_user_setup['owner_user_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )

    app.dependency_overrides.clear()

    assert res1.status_code == 403
    assert res2.status_code == 403


@pytest.mark.anyio
async def test_admin_list_and_search_users(admin_user_setup):
    """Verifies Super Admin global user listing, keyword search, and filters."""
    token = create_access_token(user_id=admin_user_setup["admin_user_id"])

    async def _override_get_db():
        async with admin_user_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. List all users
        res = await ac.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

        # 2. Search by keyword
        res_search = await ac.get(
            "/api/v1/admin/users?search=Bopha",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_search.status_code == 200
        data_search = res_search.json()
        assert data_search["total"] == 1
        assert data_search["items"][0]["full_name"] == "Bopha Cashier"

        # 3. Filter by Platform Admin Flag
        res_admin = await ac.get(
            "/api/v1/admin/users?is_platform_admin=true",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_admin.status_code == 200
        data_admin = res_admin.json()
        assert data_admin["total"] == 1
        assert data_admin["items"][0]["email"] == "superadmin@emenu.platform"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_get_user_detail_with_memberships(admin_user_setup):
    """Verifies Super Admin deep inspection of user profile with multi-tenant memberships."""
    token = create_access_token(user_id=admin_user_setup["admin_user_id"])
    cashier_id = admin_user_setup["cashier_user_id"]

    async def _override_get_db():
        async with admin_user_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(
            f"/api/v1/admin/users/{cashier_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

    app.dependency_overrides.clear()

    assert res.status_code == 200
    data = res.json()
    assert data["full_name"] == "Bopha Cashier"
    assert data["email"] == "cashier_bopha@phnompenh.com"
    assert len(data["memberships"]) == 1
    membership = data["memberships"][0]
    assert membership["organization_name"] == "Angkor Bistro Group"
    assert membership["role"] == "cashier"
    assert membership["branch_name"] == "Riverside Outlet"


@pytest.mark.anyio
async def test_admin_suspend_and_terminate_user(admin_user_setup):
    """Verifies Super Admin account suspension and self-suspension guard."""
    token = create_access_token(user_id=admin_user_setup["admin_user_id"])
    admin_id = admin_user_setup["admin_user_id"]
    target_id = admin_user_setup["owner_user_id"]

    async def _override_get_db():
        async with admin_user_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Self-suspension should be rejected
        res_self = await ac.patch(
            f"/api/v1/admin/users/{admin_id}/status",
            json={"status": "suspended", "reason": "Self test"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_self.status_code == 400
        assert "cannot suspend or terminate your own" in res_self.json()["detail"]

        # 2. Suspend target user
        res_suspend = await ac.patch(
            f"/api/v1/admin/users/{target_id}/status",
            json={"status": "suspended", "reason": "Terms of service violation"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_suspend.status_code == 200
        assert res_suspend.json()["status"] == "suspended"

        # 3. Reactivate target user
        res_reactivate = await ac.patch(
            f"/api/v1/admin/users/{target_id}/status",
            json={"status": "active", "reason": "Appeal accepted"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_reactivate.status_code == 200
        assert res_reactivate.json()["status"] == "active"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_toggle_platform_admin_privileges(admin_user_setup):
    """Verifies promoting a user to Platform Admin and self-demotion prevention."""
    token = create_access_token(user_id=admin_user_setup["admin_user_id"])
    admin_id = admin_user_setup["admin_user_id"]
    target_id = admin_user_setup["owner_user_id"]

    async def _override_get_db():
        async with admin_user_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Self-demotion should be blocked
        res_self = await ac.patch(
            f"/api/v1/admin/users/{admin_id}/platform-admin",
            json={"is_platform_admin": False, "reason": "Accidental demote"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_self.status_code == 400
        assert "cannot revoke your own" in res_self.json()["detail"]

        # 2. Promote target user to Platform Admin
        res_promote = await ac.patch(
            f"/api/v1/admin/users/{target_id}/platform-admin",
            json={"is_platform_admin": True, "reason": "Promoted to co-administrator"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_promote.status_code == 200
        assert res_promote.json()["is_platform_admin"] is True

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_reset_user_password(admin_user_setup):
    """Verifies administrative password reset and successful authentication with new password."""
    token = create_access_token(user_id=admin_user_setup["admin_user_id"])
    target_id = admin_user_setup["owner_user_id"]

    async def _override_get_db():
        async with admin_user_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Reset password
        res_reset = await ac.post(
            f"/api/v1/admin/users/{target_id}/reset-password",
            json={"new_password": "NewBrandNewPassword2026!", "reason": "Customer forgot password"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_reset.status_code == 200

        # 2. Login with new password
        res_login = await ac.post(
            "/api/v1/auth/login",
            json={
                "identifier": "chef_sok@phnompenh.com",
                "password": "NewBrandNewPassword2026!",
            },
        )
        assert res_login.status_code == 200
        assert "access_token" in res_login.json()

    app.dependency_overrides.clear()
