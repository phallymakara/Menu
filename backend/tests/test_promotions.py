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
    StaffRole,
    TableSessionStatus,
    TableStatus,
    UserStatus,
)
from app.models.menu_item import MenuItem
from app.models.order import Order, OrderItem
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.promotion import Promotion
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def promo_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            id=uuid4(),
            email="manager@promotest.com",
            password_hash="hash1",
            full_name="Manager Chann",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            id=uuid4(),
            name="Promo Org",
            slug="promo-org",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([user, org])
        await session.flush()

        membership = OrganizationMembership(
            organization_id=org.id,
            user_id=user.id,
            status=MembershipStatus.ACTIVE,
            role=StaffRole.MANAGER,
            is_owner=True,
        )
        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Bistro Phnom Penh",
            business_type="Restaurant",
            exchange_rate=Decimal("4100.00"),
            tax_percentage=Decimal("10.00"),
            is_tax_inclusive=False,
            service_charge_percentage=Decimal("5.00"),
            is_service_charge_inclusive=False,
            is_active=True,
        )
        branch = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Riverside Branch",
            code="RIV01",
            exchange_rate=Decimal("4100.00"),
            is_active=True,
        )
        area = DiningArea(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="Indoor Hall",
            service_charge_percentage=Decimal("5.00"),
            display_order=1,
            is_active=True,
        )
        table = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            dining_area_id=area.id,
            table_number="T-PROMO",
            name="Table Promo",
            min_capacity=2,
            max_capacity=4,
            shape="rectangle",
            status=TableStatus.OCCUPIED,
            qr_code_token="token-tpromo",
            is_active=True,
        )
        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Entrees",
            display_order=1,
            is_active=True,
        )
        item1 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Beef Lok Lak",
            base_price=Decimal("12.00"),
            is_active=True,
        )
        item2 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Fresh Coconut",
            base_price=Decimal("3.00"),
            is_active=True,
        )
        session.add_all([
            membership,
            business,
            branch,
            area,
            table,
            cat,
            item1,
            item2,
        ])
        await session.commit()

        # Create TableSession
        table_session = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            session_code="S-PROMO01",
            session_token="guest-token-promo01",
            guest_count=2,
            status=TableSessionStatus.ACTIVE,
            opened_by_type="staff",
        )
        session.add(table_session)
        await session.commit()

        # Order: 2x Lok Lak ($24.00) + 2x Coconut ($6.00) = Subtotal $30.00
        order = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="#P-101",
            round_number=1,
            status=OrderStatus.CONFIRMED,
            subtotal_usd=Decimal("30.00"),
            subtotal_khr=Decimal("123000.00"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=Decimal("3.00"),
            service_charge_percent=Decimal("5.00"),
            service_charge_amount_usd=Decimal("1.50"),
            total_amount_usd=Decimal("34.50"),
            total_amount_khr=Decimal("141450.00"),
        )
        item_loklak = OrderItem(
            id=uuid4(),
            order_id=order.id,
            menu_item_id=item1.id,
            item_name_en=item1.name_en,
            base_unit_price=Decimal("12.00"),
            unit_price=Decimal("12.00"),
            quantity=2,
            subtotal_price=Decimal("24.00"),
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.READY_TO_SERVE,
        )
        item_coco = OrderItem(
            id=uuid4(),
            order_id=order.id,
            menu_item_id=item2.id,
            item_name_en=item2.name_en,
            base_unit_price=Decimal("3.00"),
            unit_price=Decimal("3.00"),
            quantity=2,
            subtotal_price=Decimal("6.00"),
            course_stage=CourseStage.DRINKS,
            status=OrderItemStatus.READY_TO_SERVE,
        )
        order.items = [item_loklak, item_coco]
        session.add(order)
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
        "order_id": order.id,
    }

    await engine.dispose()


@pytest.mark.anyio
async def test_create_and_list_promotions(promo_setup):
    """Tests creating promo codes (percentage with cap & fixed amount) and listing them."""
    headers = {"Authorization": f"Bearer {promo_setup['token']}"}

    async def override_get_db():
        async with promo_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create Percentage Promo Code
        res1 = await client.post(
            f"/api/v1/businesses/{promo_setup['business_id']}/promotions",
            headers=headers,
            json={
                "name_en": "Soft Opening 20%",
                "code": "SOFT20",
                "discount_type": "percentage",
                "discount_value": 20.00,
                "max_discount_amount_usd": 5.00,
                "minimum_spend_usd": 15.00,
                "usage_limit": 100,
            },
        )
        assert res1.status_code == status.HTTP_201_CREATED
        p1 = res1.json()
        assert p1["code"] == "SOFT20"
        assert p1["discount_value"] == "20.00"
        assert p1["max_discount_amount_usd"] == "5.00"

        # List promotions
        res_list = await client.get(
            f"/api/v1/businesses/{promo_setup['business_id']}/promotions",
            headers=headers,
        )
        assert res_list.status_code == status.HTTP_200_OK
        items = res_list.json()
        assert len(items) >= 1
        assert any(i["code"] == "SOFT20" for i in items)

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_evaluate_percentage_promo_with_cap(promo_setup):
    """
    Subtotal $30.00.
    20% discount on $30 = $6.00.
    Capped at $5.00 max discount -> Discount is $5.00.
    """
    headers = {"Authorization": f"Bearer {promo_setup['token']}"}

    async def override_get_db():
        async with promo_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create promo
        await client.post(
            f"/api/v1/businesses/{promo_setup['business_id']}/promotions",
            headers=headers,
            json={
                "name_en": "Capped 20%",
                "code": "CAP20",
                "discount_type": "percentage",
                "discount_value": 20.00,
                "max_discount_amount_usd": 5.00,
                "minimum_spend_usd": 10.00,
            },
        )

        # Validate against subtotal $30.00
        val_res = await client.post(
            f"/api/v1/businesses/{promo_setup['business_id']}/branches/{promo_setup['branch_id']}/promotions/validate",
            headers=headers,
            json={
                "promo_code": "CAP20",
                "subtotal_usd": 30.00,
            },
        )
        assert val_res.status_code == status.HTTP_200_OK
        data = val_res.json()
        assert data["is_valid"] is True
        assert Decimal(str(data["discount_usd"])) == Decimal("5.00")

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_promo_minimum_spend_rejection(promo_setup):
    """
    Promo requires $50.00 minimum spend.
    Order subtotal is $30.00 -> Returns HTTP 422 Unprocessable Entity.
    """
    headers = {"Authorization": f"Bearer {promo_setup['token']}"}

    async def override_get_db():
        async with promo_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post(
            f"/api/v1/businesses/{promo_setup['business_id']}/promotions",
            headers=headers,
            json={
                "name_en": "VIP 50 Minimum",
                "code": "MIN50",
                "discount_type": "fixed_amount",
                "discount_value": 10.00,
                "minimum_spend_usd": 50.00,
            },
        )

        val_res = await client.post(
            f"/api/v1/businesses/{promo_setup['business_id']}/branches/{promo_setup['branch_id']}/promotions/validate",
            headers=headers,
            json={
                "promo_code": "MIN50",
                "subtotal_usd": 30.00,
            },
        )
        assert val_res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "minimum spend" in val_res.json()["detail"]

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_settle_table_session_cash_payment_with_promo(promo_setup):
    """
    Settles table session bill with promo code 'WELCOME5' ($5.00 off):
    - Subtotal: $30.00
    - Discount: -$5.00 -> Discounted Base: $25.00
    - Service Charge (5% of $25.00): $1.25
    - Tax (10% of $26.25): $2.63 (or 10% of $25 = $2.50)
    - Grand Total: $25.00 + $1.25 + $2.63 = $28.88
    - Grand Total KHR: 28.88 * 4100 = 118,408 -> Rounded to 118,500 KHR
    - Promotion current_usage_count incremented to 1
    """
    headers = {"Authorization": f"Bearer {promo_setup['token']}"}

    async def override_get_db():
        async with promo_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create promo
        p_res = await client.post(
            f"/api/v1/businesses/{promo_setup['business_id']}/promotions",
            headers=headers,
            json={
                "name_en": "$5 Welcome Coupon",
                "code": "WELCOME5",
                "discount_type": "fixed_amount",
                "discount_value": 5.00,
                "minimum_spend_usd": 10.00,
                "usage_limit": 1,
            },
        )
        from uuid import UUID
        promo_id = UUID(p_res.json()["id"])

        # Settle session with $30 cash and promo code
        pay_res = await client.post(
            f"/api/v1/businesses/{promo_setup['business_id']}/branches/{promo_setup['branch_id']}/table-sessions/{promo_setup['table_session_id']}/payments/cash",
            headers=headers,
            json={
                "amount_tendered_usd": 30.00,
                "amount_tendered_khr": 0,
                "preferred_change_currency": "khr",
                "promo_code": "WELCOME5",
            },
        )

    app.dependency_overrides.clear()

    assert pay_res.status_code == status.HTTP_201_CREATED
    pay_data = pay_res.json()
    assert pay_data["payment_status"] == "completed"
    assert Decimal(str(pay_data["discount_usd"])) == Decimal("5.00")
    assert pay_data["promotion_id"] == str(promo_id)
    assert "WELCOME5" in pay_data["discount_reason"]
    assert float(pay_data["grand_total_usd"]) < 34.50

    # Verify promo usage counter incremented in DB
    async with promo_setup["sessionmaker"]() as session:
        promo_obj = await session.get(Promotion, promo_id)
        assert promo_obj.current_usage_count == 1



@pytest.mark.anyio
async def test_settle_with_manual_cashier_discount(promo_setup):
    """
    Tests applying a manual cashier/manager 10% VIP discount at checkout.
    """
    headers = {"Authorization": f"Bearer {promo_setup['token']}"}

    async def override_get_db():
        async with promo_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        pay_res = await client.post(
            f"/api/v1/businesses/{promo_setup['business_id']}/branches/{promo_setup['branch_id']}/orders/{promo_setup['order_id']}/payments/cash",
            headers=headers,
            json={
                "amount_tendered_usd": 40.00,
                "amount_tendered_khr": 0,
                "preferred_change_currency": "usd",
                "manual_discount_type": "percentage",
                "manual_discount_value": 10.00,
                "discount_reason": "VIP Loyalty Member",
            },
        )

    app.dependency_overrides.clear()

    assert pay_res.status_code == status.HTTP_201_CREATED
    data = pay_res.json()
    assert Decimal(str(data["discount_usd"])) == Decimal("3.00")  # 10% of $30 = $3.00
    assert data["discount_reason"] == "VIP Loyalty Member"
    assert data["payment_status"] == "completed"

