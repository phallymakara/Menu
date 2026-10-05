"""Regression tests: staff roles limit what members can change (role-based access)."""

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.dependencies.permissions import ROLE_PERMISSIONS, Permission
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.enums import MembershipStatus, StaffRole, UserStatus
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def rbac_setup():
    """An organization with one active member per staff role."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, branch = await setup_test_tenant(session)
        headers = {
            "owner": {"Authorization": f"Bearer {create_access_token(owner.id)}"}
        }

        for role in StaffRole:
            if role == StaffRole.OWNER:
                continue
            user = User(
                email=f"{role.value}@example.com",
                password_hash=hash_password("staff_password123"),
                full_name=f"{role.value} member",
                status=UserStatus.ACTIVE,
                is_verified=True,
            )
            session.add(user)
            await session.flush()
            session.add(
                OrganizationMembership(
                    organization_id=org.id,
                    user_id=user.id,
                    role=role,
                    status=MembershipStatus.ACTIVE,
                    is_owner=False,
                )
            )
            headers[role.value] = {
                "Authorization": f"Bearer {create_access_token(user.id)}"
            }
        await session.commit()

    async def _override_db():
        async with sessionmaker() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield {"client": client, "headers": headers, "biz": biz, "branch": branch}
    app.dependency_overrides.clear()
    await engine.dispose()


def test_role_matrix_matches_the_proposal():
    """Owners hold everything; front-of-house, kitchen and back-office roles are scoped."""
    assert ROLE_PERMISSIONS[StaffRole.OWNER] == frozenset(Permission)
    manager = ROLE_PERMISSIONS[StaffRole.MANAGER]
    assert Permission.MANAGE_BUSINESS not in manager
    assert Permission.MANAGE_BRANCHES not in manager
    assert Permission.CONFIGURE_BRANCH in manager
    assert ROLE_PERMISSIONS[StaffRole.WAITER] == {
        Permission.SERVE_TABLES,
        Permission.TAKE_ORDERS,
    }
    assert Permission.TAKE_PAYMENTS in ROLE_PERMISSIONS[StaffRole.CASHIER]
    assert ROLE_PERMISSIONS[StaffRole.KITCHEN] == {Permission.OPERATE_KITCHEN}


@pytest.mark.anyio
async def test_menu_changes_require_menu_permission(rbac_setup):
    client, h, biz = rbac_setup["client"], rbac_setup["headers"], rbac_setup["biz"]
    url = f"/api/v1/businesses/{biz.id}/categories"

    denied = await client.post(url, headers=h["waiter"], json={"name_en": "Drinks"})
    assert denied.status_code == status.HTTP_403_FORBIDDEN

    read = await client.get(url, headers=h["kitchen"])
    assert read.status_code == status.HTTP_200_OK

    allowed = await client.post(
        url, headers=h["menu_editor"], json={"name_en": "Drinks"}
    )
    assert allowed.status_code == status.HTTP_201_CREATED


@pytest.mark.anyio
async def test_business_settings_are_owner_only(rbac_setup):
    client, h, biz = rbac_setup["client"], rbac_setup["headers"], rbac_setup["biz"]
    url = f"/api/v1/businesses/{biz.id}"

    for role in ("cashier", "manager"):
        res = await client.patch(url, headers=h[role], json={"name_en": "Renamed"})
        assert res.status_code == status.HTTP_403_FORBIDDEN, role

    owner = await client.patch(url, headers=h["owner"], json={"name_en": "Renamed"})
    assert owner.status_code == status.HTTP_200_OK


@pytest.mark.anyio
async def test_managers_configure_but_do_not_create_branches(rbac_setup):
    client, h = rbac_setup["client"], rbac_setup["headers"]
    biz, branch = rbac_setup["biz"], rbac_setup["branch"]
    url = f"/api/v1/businesses/{biz.id}/branches"

    create = await client.post(
        url, headers=h["manager"], json={"name_en": "Second", "code": "B-02"}
    )
    assert create.status_code == status.HTTP_403_FORBIDDEN

    update = await client.patch(
        f"{url}/{branch.id}", headers=h["manager"], json={"name_en": "Riverside"}
    )
    assert update.status_code == status.HTTP_200_OK

    owner_create = await client.post(
        url, headers=h["owner"], json={"name_en": "Second", "code": "B-02"}
    )
    assert owner_create.status_code == status.HTTP_201_CREATED


@pytest.mark.anyio
async def test_reports_require_report_permission(rbac_setup):
    client, h, biz = rbac_setup["client"], rbac_setup["headers"], rbac_setup["biz"]
    url = f"/api/v1/businesses/{biz.id}/analytics/overview"

    denied = await client.get(url, headers=h["waiter"])
    assert denied.status_code == status.HTTP_403_FORBIDDEN

    allowed = await client.get(url, headers=h["report_viewer"])
    assert allowed.status_code == status.HTTP_200_OK


@pytest.mark.anyio
async def test_waiters_serve_tables_but_cannot_change_the_floor_plan(rbac_setup):
    client, h = rbac_setup["client"], rbac_setup["headers"]
    biz, branch = rbac_setup["biz"], rbac_setup["branch"]
    url = f"/api/v1/businesses/{biz.id}/branches/{branch.id}/tables"
    table = {"table_number": "T-09", "shape": "round"}

    denied = await client.post(url, headers=h["waiter"], json=table)
    assert denied.status_code == status.HTTP_403_FORBIDDEN

    created = await client.post(url, headers=h["owner"], json=table)
    assert created.status_code == status.HTTP_201_CREATED
    table_id = created.json()["id"]

    status_change = await client.patch(
        f"{url}/{table_id}/status",
        headers=h["waiter"],
        json={"status": "dirty_cleaning"},
    )
    assert status_change.status_code == status.HTTP_200_OK

    remove = await client.delete(f"{url}/{table_id}", headers=h["waiter"])
    assert remove.status_code == status.HTTP_403_FORBIDDEN
