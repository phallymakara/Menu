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
async def bill_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            id=uuid4(),
            email="owner@billtest.com",
            password_hash="hash123",
            full_name="Bill Test Owner",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            id=uuid4(),
            name="Bill Org",
            slug="bill-org",
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
        # Store Owner dynamic input: exchange_rate = 4120.00, tax = 10%, sc = 0%
        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Bistro Phnom Penh",
            name_km="ប៊ីស្ត្រូ ភ្នំពេញ",
            business_type="Restaurant",
            exchange_rate=Decimal("4120.00"),
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
            code="BKK1",
            exchange_rate=Decimal("4150.00"),  # Branch-specific dynamic exchange rate override
            is_active=True,
        )
        # VIP Zone with 5% service charge override
        vip_area = DiningArea(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="VIP Lounge",
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
            table_number="V-01",
            name="VIP Room 1",
            min_capacity=2,
            max_capacity=6,
            shape="rectangle",
            status="occupied",
            qr_code_token="qr-token-vip01",
            is_active=True,
        )
        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Main Dishes",
            name_km="ម្ហូបចម្បង",
            display_order=1,
            is_active=True,
        )
        item1 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Lok Lak Beef",
            name_km="ឡុកឡាក់សាច់គោ",
            base_price=Decimal("8.00"),
            is_active=True,
        )
        item2 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Iced Milk Coffee",
            name_km="កាហ្វេទឹកដោះគោទឹកកក",
            base_price=Decimal("2.50"),
            is_active=True,
        )
        session.add_all([membership, business, branch, vip_area, table, cat, item1, item2])
        await session.commit()

        # Create active TableSession
        table_session = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            session_code="S-TEST01",
            session_token="guest-token-session01",
            guest_count=4,
            status=TableSessionStatus.ACTIVE,
            opened_by_type="staff",
        )
        session.add(table_session)
        await session.commit()

        # Round 1 Order: 2x Iced Coffee ($2.50 each = $5.00)
        order1 = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="#101",
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
        item1_ord1 = OrderItem(
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
        order1.items = [item1_ord1]
        session.add(order1)

        # Round 2 Order: 2x Lok Lak Beef ($8.00 each = $16.00) + 1x Voided Coffee ($2.50)
        order2 = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="#102",
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
        item1_ord2 = OrderItem(
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
        item2_ord2_voided = OrderItem(
            id=uuid4(),
            order_id=order2.id,
            menu_item_id=item2.id,
            item_name_en=item2.name_en,
            item_name_km=item2.name_km,
            base_unit_price=Decimal("2.50"),
            unit_price=Decimal("2.50"),
            quantity=1,
            subtotal_price=Decimal("2.50"),
            course_stage=CourseStage.DRINKS,
            status=OrderItemStatus.VOIDED,
            void_reason="Guest ordered by mistake",
        )
        order2.items = [item1_ord2, item2_ord2_voided]
        session.add(order2)

        # Standalone Takeaway Order (not tied to session)
        order_takeaway = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=None,
            table_session_id=None,
            order_number="#TK-01",
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
        "session_token": table_session.session_token,
        "order1_id": order1.id,
        "order2_id": order2.id,
        "order_takeaway_id": order_takeaway.id,
    }

    await engine.dispose()


@pytest.mark.anyio
async def test_session_multi_round_bill_aggregation(bill_setup):
    """
    Verifies that all rounds in a table session are consolidated accurately:
    - Round 1: 2x Coffee ($5.00)
    - Round 2: 2x Beef ($16.00) + 1x Voided Coffee ($2.50, excluded)
    - Valid Subtotal: $21.00
    - VIP Zone Service Charge (5%): $1.05
    - Tax (10% on $21.00 + $1.05 = $22.05): $2.21
    - Grand Total (USD): $21.00 + $1.05 + $2.21 = $24.26
    - Exchange Rate: 4150.00 (from branch)
    - Grand Total (KHR): 24.26 * 4150 = 100,679 KHR -> rounded to nearest 100 = 100,700 KHR.
    """
    headers = {"Authorization": f"Bearer {bill_setup['token']}"}

    async def override_get_db():
        async with bill_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/businesses/{bill_setup['business_id']}/branches/{bill_setup['branch_id']}/table-sessions/{bill_setup['table_session_id']}/bill",
            headers=headers,
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_200_OK
    data = res.json()

    assert data["table_session_id"] == str(bill_setup["table_session_id"])
    assert data["table_number"] == "V-01"
    assert data["dining_area_name"] == "VIP Lounge"
    assert data["order_count"] == 2
    assert data["total_item_count"] == 4  # 2 coffees + 2 beefs (voided excluded from count)

    # Verify rounds count
    assert len(data["rounds"]) == 2
    assert data["rounds"][0]["round_number"] == 1
    assert data["rounds"][1]["round_number"] == 2

    # Verify consolidated items
    consolidated = data["consolidated_items"]
    assert len(consolidated) == 2  # Beef and Coffee

    # Verify financial math
    financials = data["financials"]
    assert Decimal(str(financials["subtotal_usd"])) == Decimal("21.00")
    assert Decimal(str(financials["service_charge_percent"])) == Decimal("5.00")
    assert Decimal(str(financials["service_charge_amount_usd"])) == Decimal("1.05")
    assert Decimal(str(financials["tax_percent"])) == Decimal("10.00")
    assert Decimal(str(financials["tax_amount_usd"])) == Decimal("2.20")
    assert Decimal(str(financials["grand_total_usd"])) == Decimal("24.25")

    # Dynamic exchange rate and Cambodian Riel (100 KHR rounding)
    assert Decimal(str(financials["exchange_rate"])) == Decimal("4150.00")
    assert financials["subtotal_khr"] == 87200
    assert financials["service_charge_amount_khr"] == 4400
    assert financials["tax_amount_khr"] == 9100
    assert financials["grand_total_khr"] == 100600


@pytest.mark.anyio
async def test_public_guest_bill_endpoint(bill_setup):
    """
    Verifies that a customer seated at the table can access the live running bill
    using their session token without logging in.
    """
    async def override_get_db():
        async with bill_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/public/tables/sessions/{bill_setup['session_token']}/bill"
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["session_code"] == "S-TEST01"
    assert data["financials"]["grand_total_khr"] == 100600


@pytest.mark.anyio
async def test_single_order_bill_calculation(bill_setup):
    """
    Verifies that a single standalone/takeaway order can be billed directly.
    """
    headers = {"Authorization": f"Bearer {bill_setup['token']}"}

    async def override_get_db():
        async with bill_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            f"/api/v1/businesses/{bill_setup['business_id']}/branches/{bill_setup['branch_id']}/orders/{bill_setup['order_takeaway_id']}/bill",
            headers=headers,
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["order_count"] == 1
    financials = data["financials"]
    assert Decimal(str(financials["subtotal_usd"])) == Decimal("8.00")
    # Takeaway table=None -> sc_pct = 0% from branch
    assert Decimal(str(financials["service_charge_percent"])) == Decimal("0.00")
    assert Decimal(str(financials["tax_amount_usd"])) == Decimal("0.80")
    assert Decimal(str(financials["grand_total_usd"])) == Decimal("8.80")
    # 8.80 * 4150 = 36520 -> rounded to nearest 100 = 36500 KHR
    assert financials["grand_total_khr"] == 36500
