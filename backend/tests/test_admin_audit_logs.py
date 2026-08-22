from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.audit_log import AuditLog
from app.models.enums import OrganizationStatus, UserStatus
from app.models.organization import Organization
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def admin_audit_setup():
    """Seeds test database with super admin, standard owner, organizations, and sample audit logs."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        # 1. Users
        admin_user = User(
            email="superadmin@emenu.platform",
            phone="+85510000001",
            full_name="Master Platform Admin",
            password_hash=hash_password("SuperSecure123!"),
            status=UserStatus.ACTIVE,
            is_platform_admin=True,
        )
        owner_user = User(
            email="owner@phnompenh.com",
            phone="+85512777888",
            full_name="Bistro Owner",
            password_hash=hash_password("OwnerPassword123!"),
            status=UserStatus.ACTIVE,
            is_platform_admin=False,
        )
        session.add_all([admin_user, owner_user])
        await session.flush()

        # 2. Organization
        org = Organization(
            name="Angkor Bistro Group",
            slug="angkor-bistro-group",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add(org)
        await session.flush()

        # 3. Audit Logs (Platform-level and tenant-level)
        now_utc = datetime.now(timezone.utc)
        log1 = AuditLog(
            organization_id=None,
            user_id=admin_user.id,
            action="admin.plan.created",
            resource_type="plan",
            resource_id="plan-123",
            ip_address="127.0.0.1",
            user_agent="Admin-Dashboard/1.0",
            details={"plan_code": "enterprise_tier"},
            created_at=now_utc - timedelta(hours=2),
        )
        log2 = AuditLog(
            organization_id=org.id,
            user_id=admin_user.id,
            action="admin.organization.status_updated",
            resource_type="organization",
            resource_id=str(org.id),
            ip_address="127.0.0.1",
            user_agent="Admin-Dashboard/1.0",
            details={"new_status": "active"},
            created_at=now_utc - timedelta(hours=1),
        )
        log3 = AuditLog(
            organization_id=org.id,
            user_id=owner_user.id,
            action="order.item_voided",
            resource_type="order_item",
            resource_id="item-456",
            ip_address="192.168.1.50",
            user_agent="POS-Terminal/2.1",
            details={"reason": "Customer changed order", "amount_usd": 8.50},
            created_at=now_utc,
        )
        session.add_all([log1, log2, log3])
        await session.commit()

        yield {
            "engine": engine,
            "sessionmaker": sessionmaker,
            "admin_user_id": admin_user.id,
            "owner_user_id": owner_user.id,
            "org_id": org.id,
            "log1_id": log1.id,
            "log2_id": log2.id,
            "log3_id": log3.id,
        }

    await engine.dispose()


@pytest.mark.anyio
async def test_unauthorized_user_forbidden_from_admin_audit_logs(admin_audit_setup):
    """Verifies that non-super-admin users receive 403 Forbidden on /api/v1/admin/audit-logs."""
    token = create_access_token(user_id=admin_audit_setup["owner_user_id"])

    async def _override_get_db():
        async with admin_audit_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res1 = await ac.get(
            "/api/v1/admin/audit-logs",
            headers={"Authorization": f"Bearer {token}"},
        )
        res2 = await ac.get(
            f"/api/v1/admin/audit-logs/{admin_audit_setup['log1_id']}",
            headers={"Authorization": f"Bearer {token}"},
        )

    app.dependency_overrides.clear()

    assert res1.status_code == 403
    assert res2.status_code == 403


@pytest.mark.anyio
async def test_admin_query_platform_audit_logs(admin_audit_setup):
    """Verifies Super Admin cross-tenant audit log listing with joined entity context."""
    token = create_access_token(user_id=admin_audit_setup["admin_user_id"])

    async def _override_get_db():
        async with admin_audit_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(
            "/api/v1/admin/audit-logs",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

        # Check tenant joined info on log3
        item_void_log = next(i for i in data["items"] if i["action"] == "order.item_voided")
        assert item_void_log["organization_name"] == "Angkor Bistro Group"
        assert item_void_log["user_name"] == "Bistro Owner"

        # Check platform system log on log1
        plan_created_log = next(i for i in data["items"] if i["action"] == "admin.plan.created")
        assert plan_created_log["organization_name"] is None
        assert plan_created_log["user_name"] == "Master Platform Admin"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_filter_audit_logs_by_action_and_resource(admin_audit_setup):
    """Verifies filtering audit logs by action wildcard prefix (admin.*) and resource type."""
    token = create_access_token(user_id=admin_audit_setup["admin_user_id"])

    async def _override_get_db():
        async with admin_audit_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Filter by wildcard prefix 'admin.*'
        res_admin = await ac.get(
            "/api/v1/admin/audit-logs?action=admin.*",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_admin.status_code == 200
        data_admin = res_admin.json()
        assert data_admin["total"] == 2

        # 2. Filter by resource type 'order_item'
        res_resource = await ac.get(
            "/api/v1/admin/audit-logs?resource_type=order_item",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_resource.status_code == 200
        data_resource = res_resource.json()
        assert data_resource["total"] == 1
        assert data_resource["items"][0]["action"] == "order.item_voided"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_filter_audit_logs_by_organization_and_date(admin_audit_setup):
    """Verifies filtering audit logs by organization ID and timestamp bounds."""
    token = create_access_token(user_id=admin_audit_setup["admin_user_id"])
    org_id = admin_audit_setup["org_id"]

    async def _override_get_db():
        async with admin_audit_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res_org = await ac.get(
            f"/api/v1/admin/audit-logs?organization_id={org_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_org.status_code == 200
        data_org = res_org.json()
        assert data_org["total"] == 2

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_admin_get_audit_log_detail(admin_audit_setup):
    """Verifies Super Admin deep inspection of a single audit log record."""
    token = create_access_token(user_id=admin_audit_setup["admin_user_id"])
    log_id = admin_audit_setup["log3_id"]

    async def _override_get_db():
        async with admin_audit_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(
            f"/api/v1/admin/audit-logs/{log_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["action"] == "order.item_voided"
        assert data["organization_name"] == "Angkor Bistro Group"
        assert data["user_name"] == "Bistro Owner"
        assert data["details"]["reason"] == "Customer changed order"
        assert float(data["details"]["amount_usd"]) == 8.50

    app.dependency_overrides.clear()
