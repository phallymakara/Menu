from datetime import UTC, datetime, timedelta
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
from app.models.category import Category
from app.models.dining_area import DiningArea
from app.models.enums import (
    CourseStage,
    OrderItemStatus,
    OrderSource,
    OrderStatus,
    OrderType,
    StaffRole,
    StationType,
    TableSessionStatus,
    TableStatus,
    UserStatus,
)
from app.models.kitchen_station import KitchenStation
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
async def kds_setup():
    """
    Sets up a complete multi-branch test environment with kitchen stations,
    menu items assigned to stations, dining tables, sessions, and active orders.
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        # Organization & Business
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

        # Users: Brand Owner, Branch A Cook, Branch B Cook
        owner_user = User(
            id=uuid4(),
            email="owner@angkorgroup.com",
            password_hash="hash_owner",
            full_name="Empire Owner",
            status=UserStatus.ACTIVE,
        )
        cook_a_user = User(
            id=uuid4(),
            email="cook_a@angkorgroup.com",
            password_hash="hash_cook_a",
            full_name="Branch A Head Chef",
            status=UserStatus.ACTIVE,
        )
        cook_b_user = User(
            id=uuid4(),
            email="cook_b@angkorgroup.com",
            password_hash="hash_cook_b",
            full_name="Branch B Head Chef",
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
        cook_a_mem = OrganizationMembership(
            id=uuid4(),
            organization_id=org.id,
            user_id=cook_a_user.id,
            branch_id=branch_a.id,
            role=StaffRole.KITCHEN,
            is_owner=False,
            status="active",
        )
        cook_b_mem = OrganizationMembership(
            id=uuid4(),
            organization_id=org.id,
            user_id=cook_b_user.id,
            branch_id=branch_b.id,
            role=StaffRole.KITCHEN,
            is_owner=False,
            status="active",
        )

        session.add_all([
            org, business, branch_a, branch_b,
            owner_user, cook_a_user, cook_b_user,
            owner_mem, cook_a_mem, cook_b_mem,
        ])
        await session.flush()

        # Kitchen Stations for Branch A
        station_hot_a = KitchenStation(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,
            name_en="Hot Kitchen Wok",
            code="HOT",
            station_type=StationType.PREP_STATION,
            color_hex="#EF4444",
            is_active=True,
        )
        station_bar_a = KitchenStation(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,
            name_en="Bar & Beverage",
            code="BAR",
            station_type=StationType.PREP_STATION,
            color_hex="#3B82F6",
            is_active=True,
        )
        # Kitchen Station for Branch B
        station_hot_b = KitchenStation(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_b.id,
            name_en="Riverside Grill",
            code="GRL",
            station_type=StationType.PREP_STATION,
            color_hex="#F59E0B",
            is_active=True,
        )

        session.add_all([station_hot_a, station_bar_a, station_hot_b])
        await session.flush()

        # Menu Category & Items
        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Food & Drinks",
            is_active=True,
        )
        item_loklak = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Beef Lok Lak",
            base_price=Decimal("10.00"),
            prep_time_minutes=15,
            kitchen_station_id=station_hot_a.id,
            is_active=True,
        )
        item_latte = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Iced Palm Sugar Latte",
            base_price=Decimal("3.50"),
            prep_time_minutes=5,
            kitchen_station_id=station_bar_a.id,
            is_active=True,
        )
        session.add_all([cat, item_loklak, item_latte])
        await session.flush()

        # Tables & Sessions
        da_a = DiningArea(id=uuid4(), organization_id=org.id, business_id=business.id, branch_id=branch_a.id, name_en="Main Dining")
        table_a = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,
            dining_area_id=da_a.id,
            table_number="T-01",
            status=TableStatus.OCCUPIED,
            qr_code_token="token_t1",
            is_active=True,
        )
        session_a = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,
            table_id=table_a.id,
            session_code="SESS-A01",
            status=TableSessionStatus.ACTIVE,
            opened_at=datetime.now(UTC),
        )
        session.add_all([da_a, table_a, session_a])
        await session.flush()

        # Order 1 at Branch A with 1x Lok Lak (Hot Station) and 2x Latte (Bar Station)
        order_1 = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch_a.id,
            table_id=table_a.id,
            table_session_id=session_a.id,
            order_number="ORD-KDS-001",
            status=OrderStatus.PREPARING,
            order_type=OrderType.DINE_IN,
            order_source=OrderSource.GUEST_QR,
            subtotal_usd=Decimal("17.00"),
            tax_amount_usd=Decimal("1.70"),
            service_charge_amount_usd=Decimal("0.00"),
            total_amount_usd=Decimal("18.70"),
            total_amount_khr=Decimal("76670.00"),
            created_at=datetime.now(UTC) - timedelta(minutes=8),
        )
        oi_loklak = OrderItem(
            id=uuid4(),
            order_id=order_1.id,
            menu_item_id=item_loklak.id,
            kitchen_station_id=station_hot_a.id,
            item_name_en="Beef Lok Lak",
            base_unit_price=Decimal("10.00"),
            unit_price=Decimal("10.00"),
            quantity=1,
            subtotal_price=Decimal("10.00"),
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.COOKING,
            created_at=datetime.now(UTC) - timedelta(minutes=8),
        )
        oi_latte = OrderItem(
            id=uuid4(),
            order_id=order_1.id,
            menu_item_id=item_latte.id,
            kitchen_station_id=station_bar_a.id,
            item_name_en="Iced Palm Sugar Latte",
            base_unit_price=Decimal("3.50"),
            unit_price=Decimal("3.50"),
            quantity=2,
            subtotal_price=Decimal("7.00"),
            course_stage=CourseStage.DRINKS,
            status=OrderItemStatus.PENDING,
            created_at=datetime.now(UTC) - timedelta(minutes=8),
        )
        session.add_all([order_1, oi_loklak, oi_latte])
        await session.commit()

        owner_token = create_access_token(owner_user.id)
        cook_a_token = create_access_token(cook_a_user.id)
        cook_b_token = create_access_token(cook_b_user.id)

        return {
            "sessionmaker": sessionmaker,
            "business_id": business.id,
            "branch_a_id": branch_a.id,
            "branch_b_id": branch_b.id,
            "station_hot_a_id": station_hot_a.id,
            "station_bar_a_id": station_bar_a.id,
            "station_hot_b_id": station_hot_b.id,
            "order_1_id": order_1.id,
            "oi_loklak_id": oi_loklak.id,
            "oi_latte_id": oi_latte.id,
            "owner_token": owner_token,
            "cook_a_token": cook_a_token,
            "cook_b_token": cook_b_token,
        }


@pytest.mark.anyio
async def test_multi_station_item_routing(kds_setup):
    """
    Validates that items in a single multi-course order are isolated to their
    respective station screens (Hot Kitchen vs. Bar) and consolidated on Expo Pass.
    """
    headers = {"Authorization": f"Bearer {kds_setup['cook_a_token']}"}

    async def override_get_db():
        async with kds_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = kds_setup["business_id"]
        br_a_id = kds_setup["branch_a_id"]

        # 1. Hot Kitchen station query -> Should only contain Lok Lak
        res_hot = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/stations/{kds_setup['station_hot_a_id']}/tickets",
            headers=headers,
        )
        assert res_hot.status_code == status.HTTP_200_OK
        tickets_hot = res_hot.json()
        assert len(tickets_hot) == 1
        assert len(tickets_hot[0]["items"]) == 1
        assert tickets_hot[0]["items"][0]["item_name_en"] == "Beef Lok Lak"

        # 2. Bar station query -> Should only contain Latte
        res_bar = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/stations/{kds_setup['station_bar_a_id']}/tickets",
            headers=headers,
        )
        assert res_bar.status_code == status.HTTP_200_OK
        tickets_bar = res_bar.json()
        assert len(tickets_bar) == 1
        assert len(tickets_bar[0]["items"]) == 1
        assert tickets_bar[0]["items"][0]["item_name_en"] == "Iced Palm Sugar Latte"

        # 3. Expediter Master Pass -> Should contain both items
        res_expo = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/expo/tickets",
            headers=headers,
        )
        assert res_expo.status_code == status.HTTP_200_OK
        tickets_expo = res_expo.json()
        assert len(tickets_expo) == 1
        assert len(tickets_expo[0]["items"]) == 2

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_item_bump_and_station_bulk_bump(kds_setup):
    """
    Validates partial item completion (Bar finishes drink -> READY_TO_SERVE)
    and station bulk bump action.
    """
    headers = {"Authorization": f"Bearer {kds_setup['cook_a_token']}"}

    async def override_get_db():
        async with kds_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = kds_setup["business_id"]
        br_a_id = kds_setup["branch_a_id"]

        # 1. Bar bumps Latte to READY_TO_SERVE
        res_bump = await client.post(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/items/{kds_setup['oi_latte_id']}/bump",
            json={"target_status": "ready_to_serve"},
            headers=headers,
        )
        assert res_bump.status_code == status.HTTP_200_OK
        assert res_bump.json()["status"] == "ready_to_serve"

        # 2. Hot kitchen bulk bumps the Hot Station ticket to READY_TO_SERVE
        res_station_bump = await client.post(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/orders/{kds_setup['order_1_id']}/station/{kds_setup['station_hot_a_id']}/bump",
            json={"target_status": "ready_to_serve"},
            headers=headers,
        )
        assert res_station_bump.status_code == status.HTTP_200_OK
        ticket_data = res_station_bump.json()
        assert all(i["status"] == "ready_to_serve" for i in ticket_data["items"])

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_sla_and_overdue_indicators(kds_setup):
    """
    Validates that elapsed preparation times trigger SLA urgency levels:
    - Palm Sugar Latte (target 5 min, elapsed 8 min) -> 'critical' (overdue)
    - Beef Lok Lak (target 15 min, elapsed 8 min) -> 'warning' (between 50% and 100%)
    """
    headers = {"Authorization": f"Bearer {kds_setup['cook_a_token']}"}

    async def override_get_db():
        async with kds_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = kds_setup["business_id"]
        br_a_id = kds_setup["branch_a_id"]

        # Check Bar Station (Latte has 5 min SLA, elapsed 8 min -> Overdue / Critical)
        res_bar = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/stations/{kds_setup['station_bar_a_id']}/tickets",
            headers=headers,
        )
        data_bar = res_bar.json()
        item_bar = data_bar[0]["items"][0]
        assert item_bar["target_prep_time_minutes"] == 5
        assert item_bar["is_overdue"] is True
        assert item_bar["urgency_level"] == "critical"

        # Check Hot Station (Lok Lak has 15 min SLA, elapsed 8 min -> Warning)
        res_hot = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/stations/{kds_setup['station_hot_a_id']}/tickets",
            headers=headers,
        )
        data_hot = res_hot.json()
        item_hot = data_hot[0]["items"][0]
        assert item_hot["target_prep_time_minutes"] == 15
        assert item_hot["is_overdue"] is False
        assert item_hot["urgency_level"] == "warning"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_station_metrics_recall_and_undo(kds_setup):
    """
    Validates station header metrics, recall of completed tickets, and un-bump / undo action.
    """
    headers = {"Authorization": f"Bearer {kds_setup['cook_a_token']}"}

    async def override_get_db():
        async with kds_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = kds_setup["business_id"]
        br_a_id = kds_setup["branch_a_id"]
        bar_station_id = kds_setup["station_bar_a_id"]

        # 1. Check live metrics for Bar Station
        res_metrics = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/stations/{bar_station_id}/metrics",
            headers=headers,
        )
        assert res_metrics.status_code == status.HTTP_200_OK
        metrics = res_metrics.json()
        assert metrics["station_code"] == "BAR"
        assert metrics["active_tickets"] == 1
        assert metrics["overdue_tickets"] == 1

        # 2. Bump Latte to SERVED
        await client.post(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/items/{kds_setup['oi_latte_id']}/bump",
            json={"target_status": "served"},
            headers=headers,
        )

        # 3. Recall recently served tickets
        res_recall = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/stations/{bar_station_id}/recall?minutes_history=30",
            headers=headers,
        )
        assert res_recall.status_code == status.HTTP_200_OK
        recalled = res_recall.json()
        assert len(recalled) == 1
        assert recalled[0]["items"][0]["status"] == "served"

        # 4. Undo / Revert Latte back to PREPARING
        res_undo = await client.post(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/items/{kds_setup['oi_latte_id']}/undo",
            headers=headers,
        )
        assert res_undo.status_code == status.HTTP_200_OK
        assert res_undo.json()["status"] == "preparing"

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_multi_branch_kds_isolation(kds_setup):
    """
    Validates strict branch security boundaries:
    - Branch A cook accessing Branch A KDS -> 200 OK
    - Branch A cook attempting to access Branch B KDS -> 403 Forbidden
    - Brand Owner accessing both Branch A and Branch B -> 200 OK
    """
    async def override_get_db():
        async with kds_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        biz_id = kds_setup["business_id"]
        br_a_id = kds_setup["branch_a_id"]
        br_b_id = kds_setup["branch_b_id"]

        # Branch A Cook accessing Branch A -> Allowed
        res_a = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_a_id}/kds/expo/tickets",
            headers={"Authorization": f"Bearer {kds_setup['cook_a_token']}"},
        )
        assert res_a.status_code == status.HTTP_200_OK

        # Branch A Cook accessing Branch B -> Forbidden (403)
        res_b_denied = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_b_id}/kds/expo/tickets",
            headers={"Authorization": f"Bearer {kds_setup['cook_a_token']}"},
        )
        assert res_b_denied.status_code == status.HTTP_403_FORBIDDEN
        assert "Access denied" in res_b_denied.json()["detail"]

        # Brand Owner accessing Branch B -> Allowed
        res_owner = await client.get(
            f"/api/v1/businesses/{biz_id}/branches/{br_b_id}/kds/expo/tickets",
            headers={"Authorization": f"Bearer {kds_setup['owner_token']}"},
        )
        assert res_owner.status_code == status.HTTP_200_OK

    app.dependency_overrides.clear()
