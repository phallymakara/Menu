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
    OrganizationStatus,
    StationType,
    TableShape,
    TableStatus,
    UserStatus,
)
from app.models.kitchen_station import KitchenStation
from app.models.menu_item import MenuItem
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.restaurant_table import RestaurantTable
from app.models.user import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def kds_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            id=uuid4(),
            email="manager@bistro.com",
            password_hash="hash123",
            full_name="Bistro Manager",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            id=uuid4(),
            name="KDS Org",
            slug="kds-org",
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
            name_en="KDS Bistro",
            business_type="Restaurant",
            exchange_rate=Decimal("4100.00"),
            tax_percentage=Decimal("10.00"),
            service_charge_percentage=Decimal("5.00"),
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
            name_en="Dining Room",
            display_order=1,
            is_active=True,
        )
        table = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            dining_area_id=area.id,
            table_number="T-10",
            shape=TableShape.RECTANGLE,
            status=TableStatus.AVAILABLE,
            qr_code_token="valid-kds-table-token",
        )

        # 1. Create Kitchen Stations: Bar and Hot Kitchen
        bar_station = KitchenStation(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="Bar & Beverages",
            name_km="បារ និងភេសជ្ជៈ",
            code="BAR",
            station_type=StationType.PREP_STATION,
            color_hex="#3B82F6",
            display_order=1,
            is_active=True,
        )
        hot_kitchen_station = KitchenStation(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="Main Hot Kitchen",
            name_km="ផ្ទះបាយក្តៅចម្បង",
            code="HOT",
            station_type=StationType.PREP_STATION,
            color_hex="#EF4444",
            display_order=2,
            is_active=True,
        )

        # 2. Categories with default station routing
        drink_cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Beverages",
            kitchen_station_id=bar_station.id,
            display_order=1,
            is_active=True,
        )
        food_cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Main Dishes",
            kitchen_station_id=hot_kitchen_station.id,
            display_order=2,
            is_active=True,
        )

        # 3. Dishes
        item_drink = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=drink_cat.id,
            name_en="Fresh Passion Soda",
            sku="DRK-01",
            base_price=Decimal("2.50"),
            is_active=True,
        )
        item_starter = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=food_cat.id,
            name_en="Crispy Spring Rolls",
            sku="STR-01",
            base_price=Decimal("4.00"),
            is_active=True,
        )
        item_main = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=food_cat.id,
            name_en="Khmer Beef Lok Lak",
            sku="MAI-01",
            base_price=Decimal("6.50"),
            is_active=True,
        )

        session.add_all(
            [
                membership,
                business,
                branch,
                area,
                table,
                bar_station,
                hot_kitchen_station,
                drink_cat,
                food_cat,
                item_drink,
                item_starter,
                item_main,
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
        "qr_token": "valid-kds-table-token",
        "bar_station_id": bar_station.id,
        "hot_station_id": hot_kitchen_station.id,
        "item_drink_id": item_drink.id,
        "item_starter_id": item_starter.id,
        "item_main_id": item_main.id,
    }

    await engine.dispose()


@pytest.mark.anyio
async def test_kitchen_station_crud_and_assignment(kds_setup):
    """Test creating, listing, updating, and deleting custom kitchen stations."""
    data = kds_setup
    sessionmaker = data["sessionmaker"]

    async with sessionmaker() as session:

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {
                "Authorization": f"Bearer {data['token']}",
                "X-Organization-Id": str(data["org_id"]),
            }

            # 1. Create Grill Station
            create_res = await client.post(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kitchen-stations",
                headers=headers,
                json={
                    "name_en": "Grill & BBQ",
                    "name_km": "អាំងសាច់",
                    "code": "GRILL",
                    "station_type": "prep_station",
                    "color_hex": "#F59E0B",
                    "display_order": 3,
                },
            )
            assert create_res.status_code == status.HTTP_201_CREATED
            grill_data = create_res.json()
            assert grill_data["code"] == "GRILL"
            grill_id = grill_data["id"]

            # 2. List stations
            list_res = await client.get(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kitchen-stations",
                headers=headers,
            )
            assert list_res.status_code == status.HTTP_200_OK
            stations = list_res.json()
            assert len(stations) == 3  # BAR, HOT, GRILL

            # 3. Update Grill station
            update_res = await client.put(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kitchen-stations/{grill_id}",
                headers=headers,
                json={"name_en": "Charcoal Grill & BBQ", "color_hex": "#D97706"},
            )
            assert update_res.status_code == status.HTTP_200_OK
            assert update_res.json()["name_en"] == "Charcoal Grill & BBQ"

            # 4. Assign MenuItem to Grill station
            assign_res = await client.post(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kitchen-stations/{grill_id}/assignments",
                headers=headers,
                json={"menu_item_ids": [str(data["item_main_id"])]},
            )
            assert assign_res.status_code == status.HTTP_200_OK

            # 5. Delete station
            del_res = await client.delete(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kitchen-stations/{grill_id}",
                headers=headers,
            )
            assert del_res.status_code == status.HTTP_204_NO_CONTENT

        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_kds_routing_hold_and_fire_workflow(kds_setup):
    """Test station routing, course hold initialization, fire, and bumping."""
    data = kds_setup
    sessionmaker = data["sessionmaker"]

    async with sessionmaker() as session:

        async def _override_get_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_get_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {
                "Authorization": f"Bearer {data['token']}",
                "X-Organization-Id": str(data["org_id"]),
            }

            # 1. Guest places order with Drink, Starter, and Main
            order_res = await client.post(
                f"/api/v1/public/tables/orders?branch_id={data['branch_id']}&table_id={data['table_id']}&token={data['qr_token']}",
                json={
                    "guest_notes": "Window table",
                    "items": [
                        {
                            "menu_item_id": str(data["item_drink_id"]),
                            "quantity": 1,
                            "course_stage": "drinks",
                        },
                        {
                            "menu_item_id": str(data["item_starter_id"]),
                            "quantity": 2,
                            "course_stage": "starters",
                            "special_instructions": "Extra sweet chili sauce",
                        },
                        {
                            "menu_item_id": str(data["item_main_id"]),
                            "quantity": 1,
                            "course_stage": "mains",
                            "special_instructions": "Medium rare",
                        },
                    ],
                },
            )
            assert order_res.status_code == status.HTTP_201_CREATED
            order_data = order_res.json()
            order_id = order_data["id"]
            items = order_data["items"]

            # Initial statuses: Drink & Starter are PENDING; Main is HELD
            drink_item = next(
                i for i in items if i["menu_item_id"] == str(data["item_drink_id"])
            )
            starter_item = next(
                i for i in items if i["menu_item_id"] == str(data["item_starter_id"])
            )
            main_item = next(
                i for i in items if i["menu_item_id"] == str(data["item_main_id"])
            )

            assert drink_item["status"] == "pending"
            assert starter_item["status"] == "pending"
            assert main_item["status"] == "held"

            # 2. Check Bar Station Screen: only sees the Drink
            bar_res = await client.get(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kds/stations/{data['bar_station_id']}/tickets",
                headers=headers,
            )
            assert bar_res.status_code == status.HTTP_200_OK
            bar_tickets = bar_res.json()
            assert len(bar_tickets) == 1
            assert len(bar_tickets[0]["items"]) == 1
            assert bar_tickets[0]["items"][0]["item_name_en"] == "Fresh Passion Soda"

            # 3. Check Hot Kitchen Screen: sees Starter (pending) and Main (held)
            hot_res = await client.get(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kds/stations/{data['hot_station_id']}/tickets",
                headers=headers,
            )
            assert hot_res.status_code == status.HTTP_200_OK
            hot_tickets = hot_res.json()
            assert len(hot_tickets) == 1
            assert len(hot_tickets[0]["items"]) == 2
            assert hot_tickets[0]["has_held_items"] is True

            # 4. Check Expediter Master Pass Screen: sees all 3 items
            expo_res = await client.get(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kds/expo/tickets",
                headers=headers,
            )
            assert expo_res.status_code == status.HTTP_200_OK
            expo_tickets = expo_res.json()
            assert len(expo_tickets) == 1
            assert len(expo_tickets[0]["items"]) == 3

            # 5. Line Cook starts cooking and marks Starter as READY_TO_SERVE
            bump_cooking = await client.post(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kds/items/{starter_item['id']}/bump",
                headers=headers,
                json={"target_status": "cooking"},
            )
            assert bump_cooking.status_code == status.HTTP_200_OK
            assert bump_cooking.json()["status"] == "cooking"
            assert bump_cooking.json()["cooking_started_at"] is not None

            bump_ready = await client.post(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kds/items/{starter_item['id']}/bump",
                headers=headers,
                json={"target_status": "ready_to_serve"},
            )
            assert bump_ready.status_code == status.HTTP_200_OK
            assert bump_ready.json()["status"] == "ready_to_serve"
            assert bump_ready.json()["ready_at"] is not None

            # 6. Waiter clicks "Fire Mains"
            fire_res = await client.post(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kds/orders/{order_id}/fire",
                headers=headers,
                json={"course_stage": "mains"},
            )
            assert fire_res.status_code == status.HTTP_200_OK
            fired_items = fire_res.json()
            assert len(fired_items) == 1
            assert fired_items[0]["item_name_en"] == "Khmer Beef Lok Lak"
            assert fired_items[0]["status"] == "pending"
            assert fired_items[0]["fired_at"] is not None

            # 7. Re-route item test: Re-route Drink to Hot Kitchen station
            reroute_res = await client.post(
                f"/api/v1/businesses/{data['business_id']}/branches/{data['branch_id']}/kds/items/{drink_item['id']}/reroute",
                headers=headers,
                json={"target_kitchen_station_id": str(data["hot_station_id"])},
            )
            assert reroute_res.status_code == status.HTTP_200_OK
            assert reroute_res.json()["kitchen_station_id"] == str(
                data["hot_station_id"]
            )

        app.dependency_overrides.clear()
