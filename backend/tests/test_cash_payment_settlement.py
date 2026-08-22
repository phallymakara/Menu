from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.audit_log import AuditLog
from app.models.branch import Branch
from app.models.business import Business
from app.models.category import Category
from app.models.dining_area import DiningArea
from app.models.enums import (
    CourseStage,
    MembershipStatus,
    OrderItemStatus,
    OrderStatus,
    OrganizationStatus,
    TableSessionStatus,
    TableStatus,
    UserStatus,
)
from app.models.menu_item import MenuItem
from app.models.order import Order, OrderItem
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def payment_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            id=uuid4(),
            email="cashier@paymenttest.com",
            password_hash="hash123",
            full_name="Payment Cashier",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            id=uuid4(),
            name="Payment Org",
            slug="payment-org",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([user, org])
        await session.flush()

        membership = OrganizationMembership(
            organization_id=org.id,
            user_id=user.id,
            status=MembershipStatus.ACTIVE,
            is_owner=True,
        )
        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Khmer Feast Restaurant",
            business_type="Restaurant",
            exchange_rate=Decimal("4100.00"),
            tax_percentage=Decimal("10.00"),
            is_tax_inclusive=False,
            service_charge_percentage=Decimal("0.00"),
            is_service_charge_inclusive=False,
            is_active=True,
        )
        branch = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="BKK1 Main Branch",
            code="BKK1",
            exchange_rate=Decimal("4150.00"),  # Branch dynamic exchange rate
            is_active=True,
        )
        vip_area = DiningArea(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="VIP Room",
            service_charge_percentage=Decimal("5.00"),
            display_order=1,
            is_active=True,
        )
        table = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            dining_area_id=vip_area.id,
            table_number="T-01",
            name="Table 01",
            min_capacity=2,
            max_capacity=4,
            shape="rectangle",
            status=TableStatus.OCCUPIED,
            qr_code_token="token-t01",
            is_active=True,
        )
        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Dishes",
            display_order=1,
            is_active=True,
        )
        item1 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Fish Amok",
            base_price=Decimal("8.00"),
            is_active=True,
        )
        item2 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Passion Juice",
            base_price=Decimal("2.50"),
            is_active=True,
        )
        session.add_all([membership, business, branch, vip_area, table, cat, item1, item2])
        await session.commit()

        # Active TableSession
        table_session = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            session_code="S-PAY01",
            session_token="guest-token-pay01",
            guest_count=2,
            status=TableSessionStatus.ACTIVE,
            opened_by_type="staff",
        )
        session.add(table_session)
        await session.commit()

        # Round 1: 2x Juice = $5.00
        order1 = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="#P-101",
            round_number=1,
            status=OrderStatus.CONFIRMED,
            subtotal_usd=Decimal("5.00"),
            subtotal_khr=Decimal("20750.00"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=Decimal("0.50"),
            service_charge_percent=Decimal("5.00"),
            service_charge_amount_usd=Decimal("0.25"),
            total_amount_usd=Decimal("5.75"),
            total_amount_khr=Decimal("23863.00"),
        )
        item_o1 = OrderItem(
            id=uuid4(),
            order_id=order1.id,
            menu_item_id=item2.id,
            item_name_en=item2.name_en,
            base_unit_price=Decimal("2.50"),
            unit_price=Decimal("2.50"),
            quantity=2,
            subtotal_price=Decimal("5.00"),
            course_stage=CourseStage.DRINKS,
            status=OrderItemStatus.READY_TO_SERVE,
        )
        order1.items = [item_o1]
        session.add(order1)

        # Round 2: 2x Fish Amok = $16.00
        order2 = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="#P-102",
            round_number=2,
            status=OrderStatus.CONFIRMED,
            subtotal_usd=Decimal("16.00"),
            subtotal_khr=Decimal("66400.00"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=Decimal("1.60"),
            service_charge_percent=Decimal("5.00"),
            service_charge_amount_usd=Decimal("0.80"),
            total_amount_usd=Decimal("18.40"),
            total_amount_khr=Decimal("76360.00"),
        )
        item_o2 = OrderItem(
            id=uuid4(),
            order_id=order2.id,
            menu_item_id=item1.id,
            item_name_en=item1.name_en,
            base_unit_price=Decimal("8.00"),
            unit_price=Decimal("8.00"),
            quantity=2,
            subtotal_price=Decimal("16.00"),
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.PREPARING,
        )
        order2.items = [item_o2]
        session.add(order2)

        # Standalone Takeaway Order: 1x Fish Amok ($8.00 + 10% tax = $8.80)
        order_takeaway = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=None,
            table_session_id=None,
            order_number="#TK-99",
            round_number=1,
            status=OrderStatus.PENDING,
            subtotal_usd=Decimal("8.00"),
            subtotal_khr=Decimal("33200.00"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=Decimal("0.80"),
            service_charge_percent=Decimal("0.00"),
            service_charge_amount_usd=Decimal("0.00"),
            total_amount_usd=Decimal("8.80"),
            total_amount_khr=Decimal("36520.00"),
        )
        item_tk = OrderItem(
            id=uuid4(),
            order_id=order_takeaway.id,
            menu_item_id=item1.id,
            item_name_en=item1.name_en,
            base_unit_price=Decimal("8.00"),
            unit_price=Decimal("8.00"),
            quantity=1,
            subtotal_price=Decimal("8.00"),
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.PENDING,
        )
        order_takeaway.items = [item_tk]
        session.add(order_takeaway)

        await session.commit()
        token = create_access_token(user.id)

    yield {
        "engine": engine,
        "sessionmaker": sessionmaker,
        "token": token,
        "user_id": user.id,
        "org_id": org.id,
        "business_id": business.id,
        "branch_id": branch.id,
        "table_id": table.id,
        "table_session_id": table_session.id,
        "order1_id": order1.id,
        "order2_id": order2.id,
        "order_takeaway_id": order_takeaway.id,
    }

    await engine.dispose()


@pytest.mark.anyio
async def test_dine_in_mixed_cash_payment_settlement(payment_setup):
    """
    Test dine-in session cash payment with mixed USD and KHR cash:
    - Bill: Grand Total = $24.25 (100,600 KHR)
    - Cash Tendered: $20.00 USD + 20,000 KHR (= 20.00 + 4.82 = $24.82 USD)
    - Change (in KHR): ($24.82 - $24.25 = $0.57 * 4150 = 2365.5 -> rounded to 2,400 KHR)
    - Verifies:
      1. Payment transaction created with status COMPLETED.
      2. TableSession status moves to COMPLETED and closed_at is recorded.
      3. Table status moves to 'dirty_cleaning'.
      4. Orders marked as SERVED.
      5. Structured audit log recorded.
    """
    headers = {"Authorization": f"Bearer {payment_setup['token']}"}

    async def override_get_db():
        async with payment_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Settle bill with mixed cash
        res = await client.post(
            f"/api/v1/businesses/{payment_setup['business_id']}/branches/{payment_setup['branch_id']}/table-sessions/{payment_setup['table_session_id']}/payments/cash",
            headers=headers,
            json={
                "amount_tendered_usd": "20.00",
                "amount_tendered_khr": 20000,
                "preferred_change_currency": "khr",
                "notes": "Paid with $20 USD and 20,000 Riel note",
            },
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_201_CREATED
    data = res.json()

    assert data["payment_method"] == "cash"
    assert data["payment_status"] == "completed"
    assert Decimal(str(data["grand_total_usd"])) == Decimal("24.25")
    assert data["grand_total_khr"] == 100600
    assert Decimal(str(data["amount_tendered_usd"])) == Decimal("20.00")
    assert data["amount_tendered_khr"] == 20000
    assert Decimal(str(data["change_usd"])) == Decimal("0.00")
    assert data["change_khr"] == 2400  # Exact 100-Riel rounded change

    # Verify Database state
    async with payment_setup["sessionmaker"]() as session:
        # 1. Check TableSession closed
        sess = await session.get(TableSession, payment_setup["table_session_id"])
        assert sess.status == TableSessionStatus.COMPLETED
        assert sess.closed_at is not None

        # 2. Check Table set to dirty_cleaning
        tbl = await session.get(RestaurantTable, payment_setup["table_id"])
        assert tbl.status == TableStatus.DIRTY_CLEANING

        # 3. Check Orders completed
        ord1 = await session.get(Order, payment_setup["order1_id"])
        assert ord1.status == OrderStatus.SERVED
        ord2 = await session.get(Order, payment_setup["order2_id"])
        assert ord2.status == OrderStatus.SERVED

        # 4. Check Audit Log
        logs_res = await session.execute(
            select(AuditLog).where(
                AuditLog.action == "payment.settled",
                AuditLog.resource_id == data["id"],
            )
        )
        log = logs_res.scalar_one_or_none()
        assert log is not None
        assert log.details["method"] == "cash"
        assert log.details["change_khr"] == 2400


@pytest.mark.anyio
async def test_cash_payment_split_change_mode(payment_setup):
    """
    Test split change mode:
    - Bill: Takeaway $8.80 (36,500 KHR)
    - Cash Tendered: $20.00 USD
    - Excess: $11.20 USD
    - Split Change: $11.00 USD + (0.20 * 4150 = 830 -> 800 KHR)
    """
    headers = {"Authorization": f"Bearer {payment_setup['token']}"}

    async def override_get_db():
        async with payment_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/businesses/{payment_setup['business_id']}/branches/{payment_setup['branch_id']}/orders/{payment_setup['order_takeaway_id']}/payments/cash",
            headers=headers,
            json={
                "amount_tendered_usd": "20.00",
                "amount_tendered_khr": 0,
                "preferred_change_currency": "split",
            },
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_201_CREATED
    data = res.json()
    assert Decimal(str(data["grand_total_usd"])) == Decimal("8.80")
    assert Decimal(str(data["change_usd"])) == Decimal("11.00")
    assert data["change_khr"] == 800


@pytest.mark.anyio
async def test_insufficient_cash_tendered_rejected(payment_setup):
    """
    Verifies that settling with insufficient cash returns HTTP 422 with a helpful error message.
    """
    headers = {"Authorization": f"Bearer {payment_setup['token']}"}

    async def override_get_db():
        async with payment_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/businesses/{payment_setup['business_id']}/branches/{payment_setup['branch_id']}/orders/{payment_setup['order_takeaway_id']}/payments/cash",
            headers=headers,
            json={
                "amount_tendered_usd": "5.00",  # Bill is $8.80
                "amount_tendered_khr": 0,
            },
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "Insufficient cash tendered" in res.json()["detail"]


@pytest.mark.anyio
async def test_cannot_double_settle_completed_session(payment_setup):
    """
    Verifies that attempting to settle an already completed table session returns HTTP 409.
    """
    headers = {"Authorization": f"Bearer {payment_setup['token']}"}

    async def override_get_db():
        async with payment_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # First settlement
        res1 = await client.post(
            f"/api/v1/businesses/{payment_setup['business_id']}/branches/{payment_setup['branch_id']}/table-sessions/{payment_setup['table_session_id']}/payments/cash",
            headers=headers,
            json={"amount_tendered_usd": "30.00"},
        )
        assert res1.status_code == status.HTTP_201_CREATED

        # Duplicate settlement attempt
        res2 = await client.post(
            f"/api/v1/businesses/{payment_setup['business_id']}/branches/{payment_setup['branch_id']}/table-sessions/{payment_setup['table_session_id']}/payments/cash",
            headers=headers,
            json={"amount_tendered_usd": "30.00"},
        )
        assert res2.status_code == status.HTTP_409_CONFLICT
        assert "already been settled" in res2.json()["detail"]

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_get_payment_transaction_details(payment_setup):
    """
    Verifies retrieving a completed payment record by ID.
    """
    headers = {"Authorization": f"Bearer {payment_setup['token']}"}

    async def override_get_db():
        async with payment_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Settle
        res_create = await client.post(
            f"/api/v1/businesses/{payment_setup['business_id']}/branches/{payment_setup['branch_id']}/orders/{payment_setup['order_takeaway_id']}/payments/cash",
            headers=headers,
            json={"amount_tendered_usd": "10.00"},
        )
        payment_id = res_create.json()["id"]

        # Fetch
        res_get = await client.get(
            f"/api/v1/businesses/{payment_setup['business_id']}/branches/{payment_setup['branch_id']}/payments/{payment_id}",
            headers=headers,
        )

    app.dependency_overrides.clear()

    assert res_get.status_code == status.HTTP_200_OK
    assert res_get.json()["id"] == payment_id
    assert res_get.json()["payment_method"] == "cash"
    assert res_get.json()["payment_status"] == "completed"
