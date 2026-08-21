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
async def receipt_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            id=uuid4(),
            email="cashier@receipttest.com",
            password_hash="hash123",
            full_name="Sokha Cashier",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            id=uuid4(),
            name="Angkor Org",
            slug="angkor-org",
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
            name_en="Romdeng Khmer Kitchen",
            name_km="ភោជនីយដ្ឋាន រំដួលខ្មែរ",
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
            name_en="Riverside Branch",
            name_km="សាខាមាត់ទន្លេ",
            code="RVS",
            phone="+855 23 999 888",
            address="Street 178, Riverside, Phnom Penh",
            exchange_rate=Decimal("4150.00"),
            is_active=True,
        )
        vip_area = DiningArea(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="VIP Lounge",
            name_km="បន្ទប់ពិសេស VIP",
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
            table_number="VIP-1",
            name="VIP Room 1",
            min_capacity=2,
            max_capacity=6,
            shape="rectangle",
            status=TableStatus.OCCUPIED,
            qr_code_token="token-vip1",
            is_active=True,
        )
        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Authentic Khmer",
            name_km="មុខម្ហូបខ្មែរពិតៗ",
            display_order=1,
            is_active=True,
        )
        item1 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Khmer Fish Amok",
            name_km="អាម៉ុកត្រី",
            base_price=Decimal("8.00"),
            is_active=True,
        )
        item2 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Fresh Sugar Cane Juice",
            name_km="ទឹកអំពៅស្រស់",
            base_price=Decimal("2.50"),
            is_active=True,
        )
        session.add_all([membership, business, branch, vip_area, table, cat, item1, item2])
        await session.commit()

        # Dining Session
        table_session = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            session_code="S-RCP01",
            session_token="guest-token-rcp01",
            guest_count=3,
            status=TableSessionStatus.ACTIVE,
            opened_by_type="staff",
        )
        session.add(table_session)
        await session.commit()

        # Order 1 (Drinks): 2x Sugar Cane Juice = $5.00
        order1 = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="#R-101",
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
            item_name_km=item2.name_km,
            base_unit_price=Decimal("2.50"),
            unit_price=Decimal("2.50"),
            quantity=2,
            subtotal_price=Decimal("5.00"),
            course_stage=CourseStage.DRINKS,
            status=OrderItemStatus.READY_TO_SERVE,
        )
        order1.items = [item_o1]
        session.add(order1)

        # Order 2 (Food): 2x Amok = $16.00
        order2 = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="#R-102",
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
            item_name_km=item1.name_km,
            base_unit_price=Decimal("8.00"),
            unit_price=Decimal("8.00"),
            quantity=2,
            subtotal_price=Decimal("16.00"),
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.PREPARING,
        )
        order2.items = [item_o2]
        session.add(order2)

        # Standalone Takeaway Order
        order_takeaway = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=None,
            table_session_id=None,
            order_number="#TK-RECEIPT",
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
            item_name_km=item1.name_km,
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
async def test_official_receipt_html_80mm_bilingual(receipt_setup):
    """
    Settles a session bill and retrieves the official payment receipt in 80mm HTML format with bilingual layout.
    """
    headers = {"Authorization": f"Bearer {receipt_setup['token']}"}

    async def override_get_db():
        async with receipt_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Settle session
        res_pay = await client.post(
            f"/api/v1/businesses/{receipt_setup['business_id']}/branches/{receipt_setup['branch_id']}/table-sessions/{receipt_setup['table_session_id']}/payments/cash",
            headers=headers,
            json={
                "amount_tendered_usd": "25.00",
                "amount_tendered_khr": 0,
                "preferred_change_currency": "khr",
            },
        )
        assert res_pay.status_code == status.HTTP_201_CREATED
        payment_id = res_pay.json()["id"]

        # Fetch 80mm HTML Receipt
        res_rcp = await client.get(
            f"/api/v1/businesses/{receipt_setup['business_id']}/branches/{receipt_setup['branch_id']}/payments/{payment_id}/receipt?format=html&width=80mm&lang=bilingual",
            headers=headers,
        )

    app.dependency_overrides.clear()

    assert res_rcp.status_code == status.HTTP_200_OK
    assert "text/html" in res_rcp.headers["content-type"]
    html = res_rcp.text

    assert "@page" in html
    assert "size: 80mm auto" in html
    assert "Romdeng Khmer Kitchen" in html
    assert "ភោជនីយដ្ឋាន រំដួលខ្មែរ" in html
    assert "VIP-1" in html
    assert "Sokha Cashier" in html
    assert "Khmer Fish Amok" in html
    assert "អាម៉ុកត្រី" in html
    assert "$24.25" in html
    assert "100,600 KHR" in html
    assert "Cash Tendered" in html or "ប្រាក់ទទួលបាន" in html


@pytest.mark.anyio
async def test_official_receipt_text_58mm_khmer(receipt_setup):
    """
    Tests 58mm compact monospace ESC/POS receipt in Khmer primary language.
    """
    headers = {"Authorization": f"Bearer {receipt_setup['token']}"}

    async def override_get_db():
        async with receipt_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Settle session
        res_pay = await client.post(
            f"/api/v1/businesses/{receipt_setup['business_id']}/branches/{receipt_setup['branch_id']}/table-sessions/{receipt_setup['table_session_id']}/payments/cash",
            headers=headers,
            json={"amount_tendered_usd": "30.00"},
        )
        payment_id = res_pay.json()["id"]

        # Fetch 58mm Text Receipt in Khmer
        res_txt = await client.get(
            f"/api/v1/businesses/{receipt_setup['business_id']}/branches/{receipt_setup['branch_id']}/payments/{payment_id}/receipt?format=text&width=58mm&lang=km",
            headers=headers,
        )

    app.dependency_overrides.clear()

    assert res_txt.status_code == status.HTTP_200_OK
    assert "text/plain" in res_txt.headers["content-type"]
    text = res_txt.text

    assert "ភោជនីយដ្ឋាន រំដួលខ្មែរ" in text
    assert "វិក្កយបត្រផ្លូវការ" in text
    assert "VIP-1" in text
    assert "$24.25" in text
    assert "100,600 KHR" in text


@pytest.mark.anyio
async def test_precheck_bill_slip_table_session(receipt_setup):
    """
    Tests pre-check pro-forma bill slip generated for seated guests before payment.
    """
    headers = {"Authorization": f"Bearer {receipt_setup['token']}"}

    async def override_get_db():
        async with receipt_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/businesses/{receipt_setup['business_id']}/branches/{receipt_setup['branch_id']}/table-sessions/{receipt_setup['table_session_id']}/pre-check?format=html&width=80mm&lang=en",
            headers=headers,
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_200_OK
    html = res.text
    assert "PRE-CHECK BILL" in html
    assert "S-RCP01" in html
    assert "$24.25" in html


@pytest.mark.anyio
async def test_precheck_bill_slip_takeaway_order(receipt_setup):
    """
    Tests pre-check bill slip for standalone takeaway order in plain text format.
    """
    headers = {"Authorization": f"Bearer {receipt_setup['token']}"}

    async def override_get_db():
        async with receipt_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/businesses/{receipt_setup['business_id']}/branches/{receipt_setup['branch_id']}/orders/{receipt_setup['order_takeaway_id']}/pre-check?format=text&width=80mm&lang=en",
            headers=headers,
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_200_OK
    text = res.text
    assert "PRE-CHECK BILL" in text
    assert "#TK-RECEIPT" in text
    assert "$8.80" in text
    assert "36,500 KHR" in text or "36,520 KHR" in text


@pytest.mark.anyio
async def test_receipt_json_structure(receipt_setup):
    """
    Tests structured JSON receipt format for mobile POS SDK integrations.
    """
    headers = {"Authorization": f"Bearer {receipt_setup['token']}"}

    async def override_get_db():
        async with receipt_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Settle takeaway order
        res_pay = await client.post(
            f"/api/v1/businesses/{receipt_setup['business_id']}/branches/{receipt_setup['branch_id']}/orders/{receipt_setup['order_takeaway_id']}/payments/cash",
            headers=headers,
            json={"amount_tendered_usd": "10.00"},
        )
        payment_id = res_pay.json()["id"]

        # Fetch JSON receipt
        res_json = await client.get(
            f"/api/v1/businesses/{receipt_setup['business_id']}/branches/{receipt_setup['branch_id']}/payments/{payment_id}/receipt?format=json",
            headers=headers,
        )

    app.dependency_overrides.clear()

    assert res_json.status_code == status.HTTP_200_OK
    data = res_json.json()
    assert data["receipt_type"] == "OFFICIAL_RECEIPT"
    assert len(data["items"]) == 1
    assert data["items"][0]["item_name_en"] == "Khmer Fish Amok"
    assert Decimal(str(data["financials"]["grand_total_usd"])) == Decimal("8.80")
    assert Decimal(str(data["financials"]["change_usd"])) == Decimal("0.00")
    assert data["financials"]["change_khr"] == 5000
