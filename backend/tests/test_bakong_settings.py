"""Owners can configure the Bakong merchant account that KHQR payments go to."""

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.enums import MembershipStatus, StaffRole, UserStatus
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

BAKONG = {
    "bakong_account_id": "riverside_cafe@abaa",
    "bakong_merchant_name": "Riverside Cafe",
    "bakong_merchant_city": "Phnom Penh",
    "bakong_acquiring_bank": "ABA Bank",
}


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def settings_client():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, branch = await setup_test_tenant(session)
        manager = User(
            email="manager@example.com",
            password_hash=hash_password("manager_password123"),
            full_name="Manager",
            status=UserStatus.ACTIVE,
            is_verified=True,
        )
        session.add(manager)
        await session.flush()
        session.add(
            OrganizationMembership(
                organization_id=org.id,
                user_id=manager.id,
                role=StaffRole.MANAGER,
                status=MembershipStatus.ACTIVE,
                is_owner=False,
            )
        )
        await session.commit()

    async def _override_db():
        async with sessionmaker() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield {
            "client": client,
            "biz": biz,
            "branch": branch,
            "owner": {"Authorization": f"Bearer {create_access_token(owner.id)}"},
            "manager": {"Authorization": f"Bearer {create_access_token(manager.id)}"},
        }
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.anyio
async def test_owner_sets_business_bakong_account(settings_client):
    c = settings_client
    res = await c["client"].patch(
        f"/api/v1/businesses/{c['biz'].id}", headers=c["owner"], json=BAKONG
    )
    assert res.status_code == status.HTTP_200_OK
    for field, value in BAKONG.items():
        assert res.json()[field] == value


@pytest.mark.anyio
@pytest.mark.parametrize(
    "bad",
    [
        {"bakong_account_id": "not-an-account"},
        {"bakong_account_id": "spaces in@abaa"},
        {"bakong_merchant_name": "A" * 26},
        {"bakong_merchant_city": "C" * 16},
    ],
)
async def test_invalid_bakong_settings_are_rejected(settings_client, bad):
    c = settings_client
    res = await c["client"].patch(
        f"/api/v1/businesses/{c['biz'].id}", headers=c["owner"], json=bad
    )
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.anyio
async def test_manager_configures_branch_account_but_not_business(settings_client):
    c = settings_client
    business = await c["client"].patch(
        f"/api/v1/businesses/{c['biz'].id}", headers=c["manager"], json=BAKONG
    )
    assert business.status_code == status.HTTP_403_FORBIDDEN

    branch = await c["client"].patch(
        f"/api/v1/businesses/{c['biz'].id}/branches/{c['branch'].id}",
        headers=c["manager"],
        json={"bakong_account_id": "riverside_branch@abaa"},
    )
    assert branch.status_code == status.HTTP_200_OK
    assert branch.json()["bakong_account_id"] == "riverside_branch@abaa"
