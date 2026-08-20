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
from app.models.branch_menu import BranchItemOverride
from app.models.business import Business
from app.models.category import Category
from app.models.dining_area import DiningArea
from app.models.enums import (
    ItemAvailabilityStatus,
    MembershipStatus,
    OrganizationStatus,
    TableShape,
    TableStatus,
    UserStatus,
)
from app.models.item_variant import ItemVariant
from app.models.menu_item import MenuItem
from app.models.modifier import MenuItemModifierGroup, ModifierGroup, ModifierOption
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.restaurant_table import RestaurantTable
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def order_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            id=uuid4(),
            email="owner@ordertest.com",
            password_hash="hash123",
            full_name="Order Owner",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            id=uuid4(),
            name="Order Org",
            slug="order-org",
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
            name_en="Order Bistro",
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
            name_en="Flagship Branch",
            code="BR01",
            is_active=True,
        )
        area = DiningArea(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="Main Hall",
            display_order=1,
            is_active=True,
        )
        table = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            dining_area_id=area.id,
            table_number="T-01",
            shape=TableShape.RECTANGLE,
            status=TableStatus.AVAILABLE,
            qr_code_token="valid-table-qr-token-12345",
        )
        category = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Specialty Coffee",
            display_order=1,
            is_active=True,
        )
        # Dish 1: Coffee with Size Variant and Sugar Modifier
        item1 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=category.id,
            name_en="Iced Palm Sugar Latte",
            name_km="ឡាតេស្ករត្នោត",
            sku="COF-LAT-01",
            base_price=Decimal("3.00"),
            is_active=True,
        )
        # Size variant: Large (+0.75)
        variant_large = ItemVariant(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            menu_item_id=item1.id,
            name_en="Large (22oz)",
            price_adjustment=Decimal("0.75"),
            is_default=False,
            is_active=True,
        )
        # Modifier group: Sugar Level (Min 1, Max 1)
        mod_group = ModifierGroup(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Sugar Level",
            min_selections=1,
            max_selections=1,
            is_active=True,
        )
        opt_50 = ModifierOption(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            group_id=mod_group.id,
            name_en="50% Less Sweet",
            price=Decimal("0.00"),
            is_active=True,
        )
        opt_extra_shot = ModifierOption(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            group_id=mod_group.id,
            name_en="Extra Espresso Shot",
            price=Decimal("0.50"),
            is_active=True,
        )
        item_mod_link = MenuItemModifierGroup(
            organization_id=org.id,
            business_id=business.id,
            menu_item_id=item1.id,
            modifier_group_id=mod_group.id,
        )

        # Dish 2: Beef Lok Lak
        item2 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=category.id,
            name_en="Beef Lok Lak",
            name_km="ឡុកឡាក់សាច់គោ",
            sku="LOK-LAK-01",
            base_price=Decimal("5.00"),
            is_active=True,
        )

        session.add_all(
            [
                membership,
                business,
                branch,
                area,
                table,
                category,
                item1,
                variant_large,
                mod_group,
                opt_50,
                opt_extra_shot,
                item_mod_link,
                item2,
            ]
        )
        await session.commit()

        token = create_access_token(user.id)

    yield {
        "engine": engine,
        "sessionmaker": sessionmaker,
        "token": token,
        "org_id": org.id,
        "business_id": business.id,
        "branch_id": branch.id,
        "table_id": table.id,
        "qr_token": "valid-table-qr-token-12345",
        "item1_id": item1.id,
        "variant_large_id": variant_large.id,
        "opt_50_id": opt_50.id,
        "opt_extra_shot_id": opt_extra_shot.id,
        "item2_id": item2.id,
    }

    await engine.dispose()


@pytest.mark.anyio
async def test_guest_order_placement_math_and_multi_rounds(order_setup):
    """Test guest placing Round 1 and Round 2 orders with variant/modifier math."""
    data = order_setup
    sessionmaker = data["sessionmaker"]

    async with sessionmaker() as session:

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Place Round 1: 2x Large Iced Latte with Extra Shot
            # Math: ($3.00 + $0.75 + $0.50 = $4.25 * 2 = $8.50)
            round_1_res = await client.post(
                f"/api/v1/public/tables/orders?branch_id={data['branch_id']}&table_id={data['table_id']}&token={data['qr_token']}",
                json={
                    "guest_notes": "Corner table celebration",
                    "items": [
                        {
                            "menu_item_id": str(data["item1_id"]),
                            "item_variant_id": str(data["variant_large_id"]),
                            "quantity": 2,
                            "course_stage": "drinks",
                            "special_instructions": "Less ice please",
                            "modifiers": [
                                {
                                    "modifier_option_id": str(
                                        data["opt_extra_shot_id"]
                                    ),
                                    "quantity": 1,
                                }
                            ],
                        }
                    ],
                },
            )
            assert round_1_res.status_code == status.HTTP_201_CREATED
            r1_data = round_1_res.json()
            assert r1_data["round_number"] == 1
            assert r1_data["order_type"] == "dine_in"
            assert r1_data["order_source"] == "guest_qr"
            assert Decimal(str(r1_data["subtotal_usd"])) == Decimal("8.50")
            assert Decimal(str(r1_data["tax_amount_usd"])) == Decimal("0.85")  # 10%
            assert Decimal(str(r1_data["service_charge_amount_usd"])) == Decimal(
                "0.42"
            )  # 5% (0.425 -> half-even 0.42)
            assert Decimal(str(r1_data["total_amount_usd"])) == Decimal("9.77")
            assert Decimal(str(r1_data["total_amount_khr"])) == Decimal("40057.00")
            assert len(r1_data["items"]) == 1
            assert r1_data["items"][0]["item_name_en"] == "Iced Palm Sugar Latte"
            assert r1_data["items"][0]["variant_name_en"] == "Large (22oz)"
            assert len(r1_data["items"][0]["modifiers"]) == 1

            session_id = r1_data["table_session_id"]

            # 2. Place Round 2: 1x Beef Lok Lak ($5.00)
            round_2_res = await client.post(
                f"/api/v1/public/tables/orders?branch_id={data['branch_id']}&table_id={data['table_id']}&token={data['qr_token']}",
                json={
                    "items": [
                        {
                            "menu_item_id": str(data["item2_id"]),
                            "quantity": 1,
                            "course_stage": "mains",
                            "special_instructions": "Extra lime and black pepper",
                        }
                    ],
                },
            )
            assert round_2_res.status_code == status.HTTP_201_CREATED
            r2_data = round_2_res.json()
            assert r2_data["round_number"] == 2
            assert r2_data["table_session_id"] == session_id
            assert Decimal(str(r2_data["subtotal_usd"])) == Decimal("5.00")

            # 3. Retrieve Session Order Summary
            summary_res = await client.get(
                f"/api/v1/public/tables/sessions/orders?branch_id={data['branch_id']}&table_id={data['table_id']}&token={data['qr_token']}"
            )
            assert summary_res.status_code == status.HTTP_200_OK
            summary = summary_res.json()
            assert summary["total_rounds"] == 2
            assert summary["total_items_count"] == 3  # 2 drinks + 1 lok lak
            assert Decimal(str(summary["subtotal_usd"])) == Decimal(
                "13.50"
            )  # $8.50 + $5.00
            assert summary["table_number"] == "T-01"

        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_modifier_min_selections_constraint_enforcement(order_setup):
    """Test ordering an item without fulfilling mandatory modifier group returns 422."""
    data = order_setup
    sessionmaker = data["sessionmaker"]

    async with sessionmaker() as session:

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Submit item1 without selecting the mandatory Sugar Level modifier
            res = await client.post(
                f"/api/v1/public/tables/orders?branch_id={data['branch_id']}&table_id={data['table_id']}&token={data['qr_token']}",
                json={
                    "items": [
                        {
                            "menu_item_id": str(data["item1_id"]),
                            "quantity": 1,
                            "modifiers": [],  # Missing required min_selections=1
                        }
                    ],
                },
            )
            assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
            assert "requires at least 1 selection" in res.json()["detail"]

        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_out_of_stock_guard_blocks_order(order_setup):
    """Test ordering an item that is temporarily out of stock returns 400."""
    data = order_setup
    sessionmaker = data["sessionmaker"]

    async with sessionmaker() as session:
        override = BranchItemOverride(
            organization_id=data["org_id"],
            business_id=data["business_id"],
            branch_id=data["branch_id"],
            menu_item_id=data["item2_id"],
            availability_status=ItemAvailabilityStatus.TEMPORARILY_OUT_OF_STOCK.value,
        )
        session.add(override)
        await session.commit()

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/public/tables/orders?branch_id={data['branch_id']}&table_id={data['table_id']}&token={data['qr_token']}",
                json={
                    "items": [
                        {
                            "menu_item_id": str(data["item2_id"]),
                            "quantity": 1,
                        }
                    ],
                },
            )
            assert res.status_code == status.HTTP_400_BAD_REQUEST
            assert "temporarily out of stock" in res.json()["detail"]

        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_staff_pos_order_placement_and_filtering(order_setup):
    """Test staff placing an order from POS terminal and filtering branch orders."""
    data = order_setup
    sessionmaker = data["sessionmaker"]

    async with sessionmaker() as session:

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Staff creates order at Table T-01
            res = await client.post(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/orders",
                headers={
                    "Authorization": f"Bearer {data['token']}",
                    "X-Organization-Id": str(data["org_id"]),
                },
                json={
                    "table_id": str(data["table_id"]),
                    "order_type": "dine_in",
                    "guest_notes": "VIP regular customer",
                    "items": [
                        {
                            "menu_item_id": str(data["item2_id"]),
                            "quantity": 2,
                            "course_stage": "mains",
                        }
                    ],
                },
            )
            assert res.status_code == status.HTTP_201_CREATED
            order_data = res.json()
            assert order_data["order_source"] == "staff_pos"
            assert order_data["status"] == "confirmed"
            assert Decimal(str(order_data["subtotal_usd"])) == Decimal("10.00")

            # List branch orders
            list_res = await client.get(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/orders",
                headers={
                    "Authorization": f"Bearer {data['token']}",
                    "X-Organization-Id": str(data["org_id"]),
                },
            )
            assert list_res.status_code == status.HTTP_200_OK
            orders = list_res.json()
            assert len(orders) >= 1
            assert orders[0]["order_source"] == "staff_pos"

        app.dependency_overrides.clear()
