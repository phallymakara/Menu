from datetime import UTC, datetime
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
async def setup_data():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        org = Organization(id=uuid4(), name="Test Org", slug="test-org", is_active=True)
        session.add(org)
        biz = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Test Biz",
            business_type="restaurant",
            is_active=True,
        )
        session.add(biz)
        branch = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=biz.id,
            name_en="Main Branch",
            code="BR01",
            is_active=True,
        )
        session.add(branch)

        user = User(
            id=uuid4(),
            email="chef@test.com",
            password_hash="fakehash",
            full_name="Chef John",
            status=UserStatus.ACTIVE,
        )
        session.add(user)
        membership = OrganizationMembership(
            id=uuid4(),
            organization_id=org.id,
            user_id=user.id,
            branch_id=branch.id,
            role=StaffRole.KITCHEN,
            status="active",
        )
        session.add(membership)

        station = KitchenStation(
            id=uuid4(),
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Hot Line",
            code="HOT",
            station_type=StationType.PREP_STATION,
            is_active=True,
            display_order=1,
        )
        session.add(station)

        area = DiningArea(
            id=uuid4(),
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            name_en="Dining",
            is_active=True,
        )
        session.add(area)

        table = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            dining_area_id=area.id,
            table_number="T-02",
            status=TableStatus.OCCUPIED,
            qr_code_token="qr_t02",
            is_active=True,
        )
        session.add(table)

        table_session = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=table.id,
            session_code="S-001",
            session_token="guest-token-123",
            status=TableSessionStatus.ACTIVE,
        )
        session.add(table_session)

        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=biz.id,
            name_en="Food",
            is_active=True,
            display_order=1,
        )
        session.add(cat)

        dish = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=biz.id,
            category_id=cat.id,
            kitchen_station_id=station.id,
            name_en="Fried Rice",
            base_price=Decimal("5.00"),
            prep_time_minutes=15,
            is_active=True,
        )
        session.add(dish)

        order = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=biz.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="ORD-1001",
            order_type=OrderType.DINE_IN,
            order_source=OrderSource.GUEST_QR,
            round_number=1,
            status=OrderStatus.PENDING,
            subtotal_usd=Decimal("5.00"),
            subtotal_khr=Decimal("20000.00"),
            tax_rate_percent=Decimal("0.00"),
            tax_amount_usd=Decimal("0.00"),
            service_charge_percent=Decimal("0.00"),
            service_charge_amount_usd=Decimal("0.00"),
            total_amount_usd=Decimal("5.00"),
            total_amount_khr=Decimal("20000.00"),
        )
        session.add(order)

        order_item = OrderItem(
            id=uuid4(),
            order_id=order.id,
            menu_item_id=dish.id,
            kitchen_station_id=station.id,
            item_name_en="Fried Rice",
            base_unit_price=Decimal("5.00"),
            unit_price=Decimal("5.00"),
            quantity=1,
            subtotal_price=Decimal("5.00"),
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.PENDING,
            fired_at=datetime.now(UTC),
        )
        session.add(order_item)
        await session.commit()

        yield {
            "engine": engine,
            "sessionmaker": sessionmaker,
            "org": org,
            "biz": biz,
            "branch": branch,
            "user": user,
            "order": order,
            "station": station,
            "table_session": table_session,
        }

    await engine.dispose()


@pytest.mark.anyio
async def test_kds_accept_order(setup_data):
    sessionmaker = setup_data["sessionmaker"]
    biz = setup_data["biz"]
    branch = setup_data["branch"]
    user = setup_data["user"]
    order = setup_data["order"]

    token = create_access_token(user.id)

    async def override_db():
        async with sessionmaker() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/businesses/{biz.id}/branches/{branch.id}/kds/orders/{order.id}/accept",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["order_status"] == OrderStatus.PREPARING.value
        assert len(data["items"]) == 1
        assert data["items"][0]["status"] == OrderItemStatus.COOKING.value

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_kds_reject_order(setup_data):
    sessionmaker = setup_data["sessionmaker"]
    biz = setup_data["biz"]
    branch = setup_data["branch"]
    user = setup_data["user"]
    order = setup_data["order"]

    token = create_access_token(user.id)

    async def override_db():
        async with sessionmaker() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/businesses/{biz.id}/branches/{branch.id}/kds/orders/{order.id}/reject",
            headers={"Authorization": f"Bearer {token}"},
            json={"reason": "Out of ingredients"},
        )
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["order_status"] == OrderStatus.CANCELLED.value
        assert len(data["items"]) == 1
        assert data["items"][0]["status"] == OrderItemStatus.VOIDED.value
        assert data["items"][0]["void_reason"] == "Out of ingredients"

    app.dependency_overrides.clear()
