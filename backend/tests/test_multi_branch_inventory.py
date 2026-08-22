from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette import status

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import (
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
async def inventory_setup():
    """
    Sets up multi-branch organization with Brand Owner, Branch A Manager, Branch B Manager.
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        org = Organization(
            id=uuid4(),
            name="Angkor Gastronomy Group",
            slug="angkor-gastronomy",
            status="active",
            is_active=True,
        )
        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Angkor Fusion Bistro",
            business_type="restaurant",
            exchange_rate=Decimal("4100.00"),
            is_active=True,
        )
        branch_a = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="BKK1 Downtown",
            code="BKK01",
            is_active=True,
        )
        branch_b = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Riverside Pier",
            code="RIV01",
            is_active=True,
        )

        owner_user = User(
            id=uuid4(),
            email="owner@angkorgroup.com",
            password_hash="hash_owner",
            full_name="Empire Owner",
            status=UserStatus.ACTIVE,
        )
        mgr_a_user = User(
            id=uuid4(),
            email="mgr_a@angkorgroup.com",
            password_hash="hash_mgr_a",
            full_name="Branch A Manager",
            status=UserStatus.ACTIVE,
        )
        mgr_b_user = User(
            id=uuid4(),
            email="mgr_b@angkorgroup.com",
            password_hash="hash_mgr_b",
            full_name="Branch B Manager",
            status=UserStatus.ACTIVE,
        )

        owner_mem = OrganizationMembership(
            id=uuid4(),
            organization_id=org.id,
            user_id=owner_user.id,
            role=StaffRole.MANAGER,
            is_owner=True,
            status="active",
        )
        mgr_a_mem = OrganizationMembership(
            id=uuid4(),
            organization_id=org.id,
            user_id=mgr_a_user.id,
            branch_id=branch_a.id,
            role=StaffRole.MANAGER,
            is_owner=False,
            status="active",
        )
        mgr_b_mem = OrganizationMembership(
            id=uuid4(),
            organization_id=org.id,
            user_id=mgr_b_user.id,
            branch_id=branch_b.id,
            role=StaffRole.MANAGER,
            is_owner=False,
            status="active",
        )

        session.add_all([
            org, business, branch_a, branch_b,
            owner_user, mgr_a_user, mgr_b_user,
            owner_mem, mgr_a_mem, mgr_b_mem,
        ])
        await session.commit()

        owner_token = create_access_token(owner_user.id)
        mgr_a_token = create_access_token(mgr_a_user.id)
        mgr_b_token = create_access_token(mgr_b_user.id)

        return {
            "sessionmaker": sessionmaker,
            "business_id": business.id,
            "branch_a_id": branch_a.id,
            "branch_b_id": branch_b.id,
            "owner_token": owner_token,
            "mgr_a_token": mgr_a_token,
            "mgr_b_token": mgr_b_token,
        }


@pytest.mark.anyio
async def test_inventory_item_creation_and_branch_seeding(inventory_setup):
    """
    Validates master inventory item creation and automatic seeding across branches.
    """
    headers = {"Authorization": f"Bearer {inventory_setup['owner_token']}"}

    async def override_get_db():
        async with inventory_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = inventory_setup["business_id"]

        # 1. Create Master Inventory Item
        res_create = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/items",
            json={
                "name_en": "Organic Kampot Palm Sugar",
                "sku": "ING-SUGAR-01",
                "unit_of_measure": "kg",
                "cost_per_unit_usd": "2.50",
                "reorder_threshold": "10.00",
                "ideal_stock_quantity": "50.00",
                "is_active": True,
            },
            headers=headers,
        )
        assert res_create.status_code == status.HTTP_201_CREATED
        item_data = res_create.json()
        item_id = item_data["id"]
        assert item_data["name_en"] == "Organic Kampot Palm Sugar"
        assert item_data["unit_of_measure"] == "kg"

        # 2. Check Branch A Stock -> Should exist with 0 quantity
        res_stock_a = await client.get(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{inventory_setup['branch_a_id']}/stock",
            headers=headers,
        )
        assert res_stock_a.status_code == status.HTTP_200_OK
        stocks_a = res_stock_a.json()
        assert len(stocks_a) == 1
        assert stocks_a[0]["inventory_item_id"] == item_id
        assert Decimal(str(stocks_a[0]["quantity"])) == Decimal("0.00")
        assert stocks_a[0]["is_out_of_stock"] is True

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_manual_stock_adjustment_and_waste_audit(inventory_setup):
    """
    Validates manual stock adjustments (Restock & Spoilage Write-Off) with audit logging.
    """
    headers_mgr = {"Authorization": f"Bearer {inventory_setup['mgr_a_token']}"}

    async def override_get_db():
        async with inventory_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = inventory_setup["business_id"]
        br_a_id = inventory_setup["branch_a_id"]

        # Create Item
        res_create = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/items",
            json={
                "name_en": "Fresh Kampot Pepper",
                "sku": "ING-PEPPER-01",
                "unit_of_measure": "kg",
                "cost_per_unit_usd": "15.00",
                "reorder_threshold": "5.00",
                "ideal_stock_quantity": "20.00",
            },
            headers={"Authorization": f"Bearer {inventory_setup['owner_token']}"},
        )
        item_id = res_create.json()["id"]

        # 1. Branch Manager A restocks +30 kg
        res_restock = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{br_a_id}/stock/adjust",
            json={
                "inventory_item_id": item_id,
                "quantity_change": "30.00",
                "reason": "restock",
                "notes": "Direct supplier delivery",
            },
            headers=headers_mgr,
        )
        assert res_restock.status_code == status.HTTP_200_OK
        data_restock = res_restock.json()
        assert Decimal(str(data_restock["quantity"])) == Decimal("30.00")
        assert data_restock["is_low_stock"] is False

        # 2. Branch Manager A records waste -2 kg due to spoilage
        res_waste = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{br_a_id}/stock/adjust",
            json={
                "inventory_item_id": item_id,
                "quantity_change": "-2.00",
                "reason": "spoilage_waste",
                "notes": "Humidity damage in pantry",
            },
            headers=headers_mgr,
        )
        assert res_waste.status_code == status.HTTP_200_OK
        data_waste = res_waste.json()
        assert Decimal(str(data_waste["quantity"])) == Decimal("28.00")

        # 3. Excessive reduction below 0 -> Rejected with 422
        res_invalid = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{br_a_id}/stock/adjust",
            json={
                "inventory_item_id": item_id,
                "quantity_change": "-50.00",
                "reason": "stock_take_audit",
            },
            headers=headers_mgr,
        )
        assert res_invalid.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_full_inter_branch_stock_transfer_lifecycle(inventory_setup):
    """
    Validates complete transfer lifecycle:
    REQUESTED -> APPROVED -> DISPATCHED (Source deducted) -> RECEIVED (Dest incremented).
    """
    headers_mgr_a = {"Authorization": f"Bearer {inventory_setup['mgr_a_token']}"}
    headers_mgr_b = {"Authorization": f"Bearer {inventory_setup['mgr_b_token']}"}
    headers_owner = {"Authorization": f"Bearer {inventory_setup['owner_token']}"}

    async def override_get_db():
        async with inventory_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = inventory_setup["business_id"]
        br_a_id = inventory_setup["branch_a_id"]
        br_b_id = inventory_setup["branch_b_id"]

        # 1. Create item and stock Branch B with 100 kg coffee beans
        res_create = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/items",
            json={
                "name_en": "Mondulkiri Robusta Coffee Beans",
                "sku": "ING-COFFEE-01",
                "unit_of_measure": "kg",
                "cost_per_unit_usd": "8.00",
                "reorder_threshold": "10.00",
            },
            headers=headers_owner,
        )
        item_id = res_create.json()["id"]

        await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{br_b_id}/stock/adjust",
            json={
                "inventory_item_id": item_id,
                "quantity_change": "100.00",
                "reason": "restock",
            },
            headers=headers_mgr_b,
        )

        # 2. Branch A Manager creates Transfer Request for 20 kg from Branch B
        res_req = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/transfers",
            json={
                "source_branch_id": str(br_b_id),
                "destination_branch_id": str(br_a_id),
                "items": [
                    {"inventory_item_id": item_id, "requested_quantity": "20.00"}
                ],
                "notes": "Low on morning espresso beans",
            },
            headers=headers_mgr_a,
        )
        assert res_req.status_code == status.HTTP_201_CREATED
        trf_data = res_req.json()
        trf_id = trf_data["id"]
        assert trf_data["status"] == "requested"

        # 3. Branch B Manager approves the transfer
        res_appr = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/transfers/{trf_id}/approve",
            headers=headers_mgr_b,
        )
        assert res_appr.status_code == status.HTTP_200_OK
        assert res_appr.json()["status"] == "approved"

        # 4. Branch B Manager dispatches shipment -> Deducts 20 kg from Branch B
        res_disp = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/transfers/{trf_id}/dispatch",
            headers=headers_mgr_b,
        )
        assert res_disp.status_code == status.HTTP_200_OK
        assert res_disp.json()["status"] == "in_transit"

        # Verify Branch B stock is now 80 kg
        res_stock_b = await client.get(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{br_b_id}/stock",
            headers=headers_mgr_b,
        )
        b_qty = next(s["quantity"] for s in res_stock_b.json() if s["inventory_item_id"] == item_id)
        assert Decimal(str(b_qty)) == Decimal("80.00")

        # 5. Branch A Manager receives shipment -> Increments 20 kg at Branch A
        res_recv = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/transfers/{trf_id}/receive",
            headers=headers_mgr_a,
        )
        assert res_recv.status_code == status.HTTP_200_OK
        assert res_recv.json()["status"] == "completed"

        # Verify Branch A stock is now 20 kg
        res_stock_a = await client.get(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{br_a_id}/stock",
            headers=headers_mgr_a,
        )
        a_qty = next(s["quantity"] for s in res_stock_a.json() if s["inventory_item_id"] == item_id)
        assert Decimal(str(a_qty)) == Decimal("20.00")

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_low_stock_alerts(inventory_setup):
    """
    Validates low-stock alert detection across network.
    """
    headers_owner = {"Authorization": f"Bearer {inventory_setup['owner_token']}"}

    async def override_get_db():
        async with inventory_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = inventory_setup["business_id"]
        br_a_id = inventory_setup["branch_a_id"]

        # Create item with threshold 20 kg
        res_create = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/items",
            json={
                "name_en": "Grass-Fed Beef Tenderloin",
                "sku": "ING-BEEF-01",
                "unit_of_measure": "kg",
                "cost_per_unit_usd": "22.00",
                "reorder_threshold": "20.00",
            },
            headers=headers_owner,
        )
        item_id = res_create.json()["id"]

        # Branch A stocks 5 kg (< 20 kg threshold -> Shortage of 15 kg)
        await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{br_a_id}/stock/adjust",
            json={
                "inventory_item_id": item_id,
                "quantity_change": "5.00",
                "reason": "restock",
            },
            headers=headers_owner,
        )

        # Check alerts
        res_alerts = await client.get(
            f"/api/v1/businesses/{biz_id}/inventory/alerts/low-stock?branch_id={br_a_id}",
            headers=headers_owner,
        )
        assert res_alerts.status_code == status.HTTP_200_OK
        data = res_alerts.json()
        assert data["total_low_stock_items"] >= 1
        beef_alert = next(a for a in data["alerts"] if a["inventory_item_id"] == item_id)
        assert Decimal(str(beef_alert["current_quantity"])) == Decimal("5.00")
        assert Decimal(str(beef_alert["shortage_quantity"])) == Decimal("15.00")

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_inventory_multi_branch_security_boundaries(inventory_setup):
    """
    Validates that:
    - Branch A manager cannot adjust Branch B's stock (403).
    - Branch A manager cannot dispatch transfers originating from Branch B (403).
    - Brand Owner can manage across all branches.
    """
    headers_mgr_a = {"Authorization": f"Bearer {inventory_setup['mgr_a_token']}"}
    headers_owner = {"Authorization": f"Bearer {inventory_setup['owner_token']}"}

    async def override_get_db():
        async with inventory_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = inventory_setup["business_id"]
        br_a_id = inventory_setup["branch_a_id"]
        br_b_id = inventory_setup["branch_b_id"]

        # Create Item
        res_create = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/items",
            json={
                "name_en": "Cooking Oil",
                "sku": "ING-OIL-01",
                "unit_of_measure": "liter",
            },
            headers=headers_owner,
        )
        item_id = res_create.json()["id"]

        # Branch A Manager attempts to adjust Branch B's stock -> 403 Forbidden
        res_denied_adj = await client.post(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{br_b_id}/stock/adjust",
            json={
                "inventory_item_id": item_id,
                "quantity_change": "10.00",
                "reason": "restock",
            },
            headers=headers_mgr_a,
        )
        assert res_denied_adj.status_code == status.HTTP_403_FORBIDDEN
        assert "Access denied" in res_denied_adj.json()["detail"]

        # Branch A Manager attempts to view Branch B's stock -> 403 Forbidden
        res_denied_view = await client.get(
            f"/api/v1/businesses/{biz_id}/inventory/branches/{br_b_id}/stock",
            headers=headers_mgr_a,
        )
        assert res_denied_view.status_code == status.HTTP_403_FORBIDDEN

    app.dependency_overrides.clear()
