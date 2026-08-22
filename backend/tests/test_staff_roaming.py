from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token, decode_token_payload
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


@pytest.fixture
async def roaming_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        # 1. Organization & Business
        org = Organization(
            id=uuid4(),
            name="Khmer Bistro Hospitality Group",
            slug="khmer-bistro-group",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Khmer Bistro",
            business_type="Restaurant",
            exchange_rate=Decimal("4100.00"),
            is_active=True,
        )
        branch_a = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="BKK1 Flagship",
            code="BKK01",
            is_active=True,
        )
        branch_b = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Riverside Bistro",
            code="RIV01",
            is_active=True,
        )
        session.add_all([org, business, branch_a, branch_b])
        await session.flush()

        # 2. Users
        # A) Brand Owner
        owner_user = User(
            id=uuid4(),
            email="owner@khmerbistro.com",
            password_hash="hash_owner",
            full_name="Brand Owner",
            status=UserStatus.ACTIVE,
        )
        owner_membership = OrganizationMembership(
            organization_id=org.id,
            user_id=owner_user.id,
            branch_id=None,
            status=MembershipStatus.ACTIVE,
            role=StaffRole.MANAGER,
            is_owner=True,
        )

        # B) General Manager (branch_id = None, is_owner = False)
        gm_user = User(
            id=uuid4(),
            email="gm@khmerbistro.com",
            password_hash="hash_gm",
            full_name="General Manager",
            status=UserStatus.ACTIVE,
        )
        gm_membership = OrganizationMembership(
            organization_id=org.id,
            user_id=gm_user.id,
            branch_id=None,
            status=MembershipStatus.ACTIVE,
            role=StaffRole.MANAGER,
            is_owner=False,
        )

        # C) Branch Manager A (locked to Branch A)
        bm_user = User(
            id=uuid4(),
            email="bm_bkk1@khmerbistro.com",
            password_hash="hash_bm",
            full_name="BKK1 Store Manager",
            status=UserStatus.ACTIVE,
        )
        bm_membership = OrganizationMembership(
            organization_id=org.id,
            user_id=bm_user.id,
            branch_id=branch_a.id,
            status=MembershipStatus.ACTIVE,
            role=StaffRole.MANAGER,
            is_owner=False,
        )

        # D) Branch Cashier (locked to Branch A)
        cashier_user = User(
            id=uuid4(),
            email="cashier_bkk1@khmerbistro.com",
            password_hash="hash_cashier",
            full_name="BKK1 Cashier",
            status=UserStatus.ACTIVE,
        )
        cashier_membership = OrganizationMembership(
            organization_id=org.id,
            user_id=cashier_user.id,
            branch_id=branch_a.id,
            status=MembershipStatus.ACTIVE,
            role=StaffRole.CASHIER,
            is_owner=False,
        )

        session.add_all([
            owner_user,
            owner_membership,
            gm_user,
            gm_membership,
            bm_user,
            bm_membership,
            cashier_user,
            cashier_membership,
        ])
        await session.commit()

        owner_token = create_access_token(owner_user.id)
        gm_token = create_access_token(gm_user.id)
        bm_token = create_access_token(bm_user.id)
        cashier_token = create_access_token(cashier_user.id)

    yield {
        "engine": engine,
        "sessionmaker": sessionmaker,
        "org_id": org.id,
        "business_id": business.id,
        "branch_a_id": branch_a.id,
        "branch_b_id": branch_b.id,
        "owner_token": owner_token,
        "gm_token": gm_token,
        "bm_token": bm_token,
        "cashier_token": cashier_token,
    }

    await engine.dispose()


@pytest.mark.anyio
async def test_brand_owner_can_list_and_switch_branches(roaming_setup):
    """
    Validates that a Brand Owner sees all branches and can switch to any branch.
    """
    headers = {"Authorization": f"Bearer {roaming_setup['owner_token']}"}

    async def override_get_db():
        async with roaming_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Get my branches
        res = await client.get("/api/v1/auth/my-branches", headers=headers)
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["can_switch_branches"] is True
        assert len(data["branches"]) == 2

        branch_ids = [b["branch_id"] for b in data["branches"]]
        assert str(roaming_setup["branch_a_id"]) in branch_ids
        assert str(roaming_setup["branch_b_id"]) in branch_ids

        # 2. Switch to Branch B
        switch_res = await client.post(
            "/api/v1/auth/switch-branch",
            headers=headers,
            json={"branch_id": str(roaming_setup["branch_b_id"])},
        )
        assert switch_res.status_code == status.HTTP_200_OK
        switch_data = switch_res.json()
        assert switch_data["active_branch_id"] == str(roaming_setup["branch_b_id"])
        assert switch_data["branch_name_en"] == "Riverside Bistro"
        assert switch_data["is_owner"] is True

        # 3. Verify JWT claims contain active_branch_id
        token = switch_data["access_token"]
        payload = decode_token_payload(token)
        assert payload["active_branch_id"] == str(roaming_setup["branch_b_id"])

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_general_manager_can_list_and_switch_branches(roaming_setup):
    """
    Validates that a General Manager (branch_id=None) sees all branches and can switch.
    """
    headers = {"Authorization": f"Bearer {roaming_setup['gm_token']}"}

    async def override_get_db():
        async with roaming_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Get my branches
        res = await client.get("/api/v1/auth/my-branches", headers=headers)
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["can_switch_branches"] is True
        assert len(data["branches"]) == 2

        # 2. Switch to Branch A
        switch_res = await client.post(
            "/api/v1/auth/switch-branch",
            headers=headers,
            json={"branch_id": str(roaming_setup["branch_a_id"])},
        )
        assert switch_res.status_code == status.HTTP_200_OK
        assert switch_res.json()["active_branch_id"] == str(roaming_setup["branch_a_id"])

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_branch_manager_is_locked_and_cannot_switch_to_other_branch(roaming_setup):
    """
    Validates that a Branch Manager sees ONLY their assigned branch and is blocked
    from switching to any other branch.
    """
    headers = {"Authorization": f"Bearer {roaming_setup['bm_token']}"}

    async def override_get_db():
        async with roaming_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Get my branches
        res = await client.get("/api/v1/auth/my-branches", headers=headers)
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["can_switch_branches"] is False
        assert len(data["branches"]) == 1
        assert data["branches"][0]["branch_id"] == str(roaming_setup["branch_a_id"])
        assert data["branches"][0]["branch_name_en"] == "BKK1 Flagship"

        # 2. Attempt to switch to Branch B -> Expect HTTP 403 Forbidden!
        switch_res = await client.post(
            "/api/v1/auth/switch-branch",
            headers=headers,
            json={"branch_id": str(roaming_setup["branch_b_id"])},
        )
        assert switch_res.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Brand Owners and General Managers can switch branch contexts" in switch_res.json()["detail"]

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_branch_cashier_is_locked_and_cannot_switch_branches(roaming_setup):
    """
    Validates that a Cashier sees ONLY their assigned branch and cannot switch branches.
    """
    headers = {"Authorization": f"Bearer {roaming_setup['cashier_token']}"}

    async def override_get_db():
        async with roaming_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Get my branches
        res = await client.get("/api/v1/auth/my-branches", headers=headers)
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["can_switch_branches"] is False
        assert len(data["branches"]) == 1
        assert data["branches"][0]["branch_id"] == str(roaming_setup["branch_a_id"])

        # 2. Attempt to switch to Branch B -> Expect HTTP 403 Forbidden!
        switch_res = await client.post(
            "/api/v1/auth/switch-branch",
            headers=headers,
            json={"branch_id": str(roaming_setup["branch_b_id"])},
        )
        assert switch_res.status_code == status.HTTP_403_FORBIDDEN
        assert "Only Brand Owners and General Managers can switch branch contexts" in switch_res.json()["detail"]

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_switch_to_nonexistent_branch_returns_404(roaming_setup):
    """
    Validates that attempting to switch to a non-existent branch returns HTTP 404.
    """
    headers = {"Authorization": f"Bearer {roaming_setup['owner_token']}"}

    async def override_get_db():
        async with roaming_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        switch_res = await client.post(
            "/api/v1/auth/switch-branch",
            headers=headers,
            json={"branch_id": str(uuid4())},
        )
        assert switch_res.status_code == status.HTTP_404_NOT_FOUND
        assert "Target branch not found" in switch_res.json()["detail"]

    app.dependency_overrides.clear()
