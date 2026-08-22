from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.branch import Branch
from app.models.business import Business
from app.models.category import Category
from app.models.dining_area import DiningArea
from app.models.enums import (
    MembershipStatus,
    OrderItemStatus,
    OrderSource,
    OrderStatus,
    OrderType,
    OrganizationStatus,
    PaymentMethod,
    PaymentStatus,
    StaffRole,
    TableSessionStatus,
    TableStatus,
    UserStatus,
)
from app.models.menu_item import MenuItem
from app.models.order import Order, OrderItem
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.payment import Payment
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def analytics_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        # Organization & Business
        org = Organization(
            id=uuid4(),
            name="Khmer Culinary Empire",
            slug="khmer-culinary",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Khmer Bistro",
            business_type="restaurant",
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

        # Users
        owner_user = User(
            id=uuid4(),
            email="owner@khmerculinary.com",
            password_hash="hash_owner",
            full_name="Empire Owner",
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

        bm_user = User(
            id=uuid4(),
            email="bm_bkk1@khmerculinary.com",
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
        session.add_all([owner_user, owner_membership, bm_user, bm_membership])
        await session.flush()

        # Category & Menu Items
        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Mains",
            is_active=True,
        )
        item_loklak = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=None,  # Master Item
            category_id=cat.id,
            name_en="Beef Lok Lak",
            base_price=Decimal("10.00"),
            is_active=True,
        )
        item_latte = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,  # Local Item Branch A
            category_id=cat.id,
            name_en="Palm Sugar Latte",
            base_price=Decimal("3.00"),
            is_active=True,
        )
        session.add_all([cat, item_loklak, item_latte])
        await session.flush()

        # Dining Areas & Tables
        da_a = DiningArea(id=uuid4(), organization_id=org.id, business_id=business.id, branch_id=branch_a.id, name_en="Hall A")
        da_b = DiningArea(id=uuid4(), organization_id=org.id, business_id=business.id, branch_id=branch_b.id, name_en="Hall B")
        table_a = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,
            dining_area_id=da_a.id,
            table_number="T1",
            status=TableStatus.AVAILABLE,
        )
        table_b = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_b.id,
            dining_area_id=da_b.id,
            table_number="T2",
            status=TableStatus.AVAILABLE,
        )
        session.add_all([da_a, da_b, table_a, table_b])
        await session.flush()

        # Sessions
        sess_a = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,
            table_id=table_a.id,
            session_code="SESS-001",
            status=TableSessionStatus.COMPLETED,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
        )
        sess_b = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_b.id,
            table_id=table_b.id,
            session_code="SESS-002",
            status=TableSessionStatus.COMPLETED,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
        )
        session.add_all([sess_a, sess_b])
        await session.flush()

        # Orders & OrderItems
        # Order 1 (Branch A): 2x Lok Lak ($20.00) -> Net $19.80
        order_1 = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,
            table_session_id=sess_a.id,
            order_number="ORD-001",
            status=OrderStatus.SERVED,
            order_type=OrderType.DINE_IN,
            order_source=OrderSource.STAFF_POS,
            subtotal_usd=Decimal("20.00"),
            tax_amount_usd=Decimal("1.80"),
            service_charge_amount_usd=Decimal("0.00"),
            total_amount_usd=Decimal("19.80"),
            total_amount_khr=Decimal("81180.00"),
        )
        oi_1 = OrderItem(
            id=uuid4(),
            order_id=order_1.id,
            menu_item_id=item_loklak.id,
            item_name_en="Beef Lok Lak",
            base_unit_price=Decimal("10.00"),
            unit_price=Decimal("10.00"),
            quantity=2,
            subtotal_price=Decimal("20.00"),
            status=OrderItemStatus.SERVED,
        )

        # Order 2 (Branch B): 3x Lok Lak ($30.00) -> Net $33.00
        order_2 = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_b.id,
            table_session_id=sess_b.id,
            order_number="ORD-002",
            status=OrderStatus.SERVED,
            order_type=OrderType.DINE_IN,
            order_source=OrderSource.STAFF_POS,
            subtotal_usd=Decimal("30.00"),
            tax_amount_usd=Decimal("3.00"),
            service_charge_amount_usd=Decimal("0.00"),
            total_amount_usd=Decimal("33.00"),
            total_amount_khr=Decimal("135300.00"),
        )
        oi_2 = OrderItem(
            id=uuid4(),
            order_id=order_2.id,
            menu_item_id=item_loklak.id,
            item_name_en="Beef Lok Lak",
            base_unit_price=Decimal("10.00"),
            unit_price=Decimal("10.00"),
            quantity=3,
            subtotal_price=Decimal("30.00"),
            status=OrderItemStatus.SERVED,
        )

        session.add_all([order_1, oi_1, order_2, oi_2])
        await session.flush()

        # Payments
        pay_1 = Payment(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,
            table_session_id=sess_a.id,
            payment_number="PAY-001",
            payment_method=PaymentMethod.KHQR,
            payment_status=PaymentStatus.COMPLETED,
            bill_subtotal_usd=Decimal("20.00"),
            discount_usd=Decimal("2.00"),
            tax_usd=Decimal("1.80"),
            grand_total_usd=Decimal("19.80"),
            grand_total_khr=81180,
            exchange_rate=Decimal("4100.00"),
            total_tendered_usd=Decimal("19.80"),
            settled_at=datetime.now(UTC),
        )
        pay_2 = Payment(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_b.id,
            table_session_id=sess_b.id,
            payment_number="PAY-002",
            payment_method=PaymentMethod.CASH,
            payment_status=PaymentStatus.COMPLETED,
            bill_subtotal_usd=Decimal("30.00"),
            discount_usd=Decimal("0.00"),
            tax_usd=Decimal("3.00"),
            grand_total_usd=Decimal("33.00"),
            grand_total_khr=135300,
            exchange_rate=Decimal("4100.00"),
            total_tendered_usd=Decimal("33.00"),
            settled_at=datetime.now(UTC),
        )
        session.add_all([pay_1, pay_2])
        await session.commit()


        owner_token = create_access_token(owner_user.id)
        bm_token = create_access_token(bm_user.id)

    yield {
        "engine": engine,
        "sessionmaker": sessionmaker,
        "org_id": org.id,
        "business_id": business.id,
        "branch_a_id": branch_a.id,
        "branch_b_id": branch_b.id,
        "owner_token": owner_token,
        "bm_token": bm_token,
        "item_loklak_id": item_loklak.id,
    }

    await engine.dispose()


@pytest.mark.anyio
async def test_owner_consolidated_sales_overview(analytics_setup):
    """
    Validates consolidated HQ sales overview across all network branches.
    """
    headers = {"Authorization": f"Bearer {analytics_setup['owner_token']}"}

    async def override_get_db():
        async with analytics_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/businesses/{analytics_setup['business_id']}/analytics/overview",
            headers=headers,
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()

        assert Decimal(str(data["total_gross_sales_usd"])) == Decimal("50.00")
        assert Decimal(str(data["total_discounts_usd"])) == Decimal("2.00")
        assert Decimal(str(data["total_tax_usd"])) == Decimal("4.80")
        assert Decimal(str(data["total_net_revenue_usd"])) == Decimal("52.80")
        assert Decimal(str(data["total_net_revenue_khr"])) == Decimal("216500")
        assert data["total_completed_orders"] == 2
        assert data["total_closed_sessions"] == 2
        assert Decimal(str(data["average_order_value_usd"])) == Decimal("26.40")

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_multi_branch_comparison_ranking(analytics_setup):
    """
    Validates branch comparison ranking and revenue share percentages.
    """
    headers = {"Authorization": f"Bearer {analytics_setup['owner_token']}"}

    async def override_get_db():
        async with analytics_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/businesses/{analytics_setup['business_id']}/analytics/branch-comparison",
            headers=headers,
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()

        assert Decimal(str(data["total_network_revenue_usd"])) == Decimal("52.80")
        assert data["total_network_orders"] == 2
        assert len(data["branches"]) == 2

        # Branch B has $33.00 -> Rank 1
        rank1 = data["branches"][0]
        assert rank1["branch_code"] == "RIV01"
        assert rank1["rank"] == 1
        assert Decimal(str(rank1["total_revenue_usd"])) == Decimal("33.00")
        assert Decimal(str(rank1["revenue_share_percentage"])) == Decimal("62.50")

        # Branch A has $19.80 -> Rank 2
        rank2 = data["branches"][1]
        assert rank2["branch_code"] == "BKK01"
        assert rank2["rank"] == 2
        assert Decimal(str(rank2["total_revenue_usd"])) == Decimal("19.80")
        assert Decimal(str(rank2["revenue_share_percentage"])) == Decimal("37.50")

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_top_selling_items_rollup(analytics_setup):
    """
    Validates top-selling menu items with branch quantity breakdowns.
    """
    headers = {"Authorization": f"Bearer {analytics_setup['owner_token']}"}

    async def override_get_db():
        async with analytics_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/businesses/{analytics_setup['business_id']}/analytics/top-items",
            headers=headers,
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert len(data["items"]) >= 1

        top_item = data["items"][0]
        assert top_item["item_name_en"] == "Beef Lok Lak"
        assert top_item["total_quantity_sold"] == 5
        assert Decimal(str(top_item["total_revenue_usd"])) == Decimal("50.00")
        assert top_item["branch_breakdown"]["BKK01"] == 2
        assert top_item["branch_breakdown"]["RIV01"] == 3

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_payment_method_breakdown(analytics_setup):
    """
    Validates payment channel distribution (Bakong KHQR vs. Cash).
    """
    headers = {"Authorization": f"Bearer {analytics_setup['owner_token']}"}

    async def override_get_db():
        async with analytics_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/businesses/{analytics_setup['business_id']}/analytics/payment-breakdown",
            headers=headers,
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert Decimal(str(data["total_collected_usd"])) == Decimal("52.80")
        assert data["total_transactions"] == 2

        method_names = [m["payment_method"].lower() for m in data["methods"]]
        assert "khqr" in method_names
        assert "cash" in method_names

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_branch_manager_access_boundaries(analytics_setup):
    """
    Validates that a Branch Manager is locked to their assigned branch:
    - Overview automatically returns only Branch A data.
    - Attempting to query Branch B returns HTTP 403.
    - Attempting to query branch comparison matrix returns HTTP 403.
    """
    headers = {"Authorization": f"Bearer {analytics_setup['bm_token']}"}

    async def override_get_db():
        async with analytics_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Overview without branch_id param defaults to assigned Branch A ($19.80)
        res1 = await client.get(
            f"/api/v1/businesses/{analytics_setup['business_id']}/analytics/overview",
            headers=headers,
        )
        assert res1.status_code == status.HTTP_200_OK
        data1 = res1.json()
        assert Decimal(str(data1["total_net_revenue_usd"])) == Decimal("19.80")
        assert data1["branch_id"] == str(analytics_setup["branch_a_id"])

        # 2. Branch Manager attempts to query Branch B -> Expect HTTP 403
        res2 = await client.get(
            f"/api/v1/businesses/{analytics_setup['business_id']}/analytics/overview?branch_id={analytics_setup['branch_b_id']}",
            headers=headers,
        )
        assert res2.status_code == status.HTTP_403_FORBIDDEN

        # 3. Branch Manager attempts to query branch-comparison -> Expect HTTP 403
        res3 = await client.get(
            f"/api/v1/businesses/{analytics_setup['business_id']}/analytics/branch-comparison",
            headers=headers,
        )
        assert res3.status_code == status.HTTP_403_FORBIDDEN

    app.dependency_overrides.clear()
