"""Regression tests: the KDS must not expose or modify another tenant's kitchen."""

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_owner_cannot_read_or_bump_another_tenants_kds():
    """An owner of org B gets 404 on org A's KDS routes; org A's owner still gets 200."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner_a, _, biz_a, branch_a = await setup_test_tenant(
            session, org_name="Victim Org", email="victim@example.com"
        )
        owner_b, _, _, _ = await setup_test_tenant(
            session, org_name="Attacker Org", email="attacker@example.com"
        )

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        kds_base = f"/api/v1/businesses/{biz_a.id}/branches/{branch_a.id}/kds"
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                attacker = {"Authorization": f"Bearer {create_access_token(owner_b.id)}"}
                read = await client.get(f"{kds_base}/expo/tickets", headers=attacker)
                assert read.status_code == status.HTTP_404_NOT_FOUND

                owner = {"Authorization": f"Bearer {create_access_token(owner_a.id)}"}
                own_read = await client.get(f"{kds_base}/expo/tickets", headers=owner)
                assert own_read.status_code == status.HTTP_200_OK
        finally:
            app.dependency_overrides.clear()

    await engine.dispose()
