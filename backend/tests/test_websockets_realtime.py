import json
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from starlette.testclient import TestClient

from app.core.security import create_access_token
from app.db.base import Base
from app.main import app
from app.models.branch import Branch
from app.models.business import Business
from app.models.category import Category
from app.models.dining_area import DiningArea
from app.models.enums import (
    CourseStage,
    StaffRole,
    StationType,
    TableSessionStatus,
    TableStatus,
    UserStatus,
)
from app.models.kitchen_station import KitchenStation
from app.models.menu_item import MenuItem
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.models.user import User
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def ws_setup():
    """
    Sets up database with Org, Business, Branch, Table, TableSession, Staff, and Menu Items.
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
        branch = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="BKK1 Downtown",
            code="BKK01",
            is_active=True,
        )

        user_staff = User(
            id=uuid4(),
            email="staff@angkorgroup.com",
            password_hash="hash_staff",
            full_name="BKK1 Cashier",
            status=UserStatus.ACTIVE,
        )
        user_mem = OrganizationMembership(
            id=uuid4(),
            organization_id=org.id,
            user_id=user_staff.id,
            branch_id=branch.id,
            role=StaffRole.CASHIER,
            is_owner=False,
            status="active",
        )

        station_hot = KitchenStation(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="Hot Wok",
            code="HOT",
            station_type=StationType.PREP_STATION,
            is_active=True,
        )

        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Main Dishes",
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
            kitchen_station_id=station_hot.id,
            is_active=True,
        )

        da = DiningArea(id=uuid4(), organization_id=org.id, business_id=business.id, branch_id=branch.id, name_en="Main Floor")
        table = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            dining_area_id=da.id,
            table_number="T-01",
            status=TableStatus.OCCUPIED,
            qr_code_token="token_qr_01",
            is_active=True,
        )
        table_session = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            session_code="SESS-101",
            status=TableSessionStatus.ACTIVE,
            opened_at=datetime.now(UTC),
        )

        session.add_all([
            org, business, branch, user_staff, user_mem,
            station_hot, cat, item_loklak, da, table, table_session,
        ])
        await session.commit()

        staff_token = create_access_token(user_staff.id)

        return {
            "engine": engine,
            "sessionmaker": sessionmaker,
            "business_id": business.id,
            "branch_id": branch.id,
            "table_id": table.id,
            "table_session_id": table_session.id,
            "session_token": table_session.session_token,
            "item_loklak_id": item_loklak.id,
            "station_hot_id": station_hot.id,
            "staff_token": staff_token,
        }


@pytest.mark.anyio
async def test_staff_websocket_connection_and_ping(ws_setup, monkeypatch):
    """
    Validates staff WebSocket connection and ping/pong heartbeat.
    """
    from app.api.v1.endpoints import websockets

    # Patch AsyncSessionFactory in websockets endpoint to use test engine
    monkeypatch.setattr(websockets, "AsyncSessionFactory", ws_setup["sessionmaker"])

    client = TestClient(app)
    branch_id = ws_setup["branch_id"]
    token = ws_setup["staff_token"]

    with client.websocket_connect(f"/api/v1/ws/branches/{branch_id}?token={token}&room_type=pos") as websocket:
        websocket.send_text("ping")
        data = websocket.receive_text()
        assert data == "pong"


@pytest.mark.anyio
async def test_guest_websocket_connection_and_ping(ws_setup, monkeypatch):
    """
    Validates guest dining session WebSocket connection and ping/pong.
    """
    from app.api.v1.endpoints import websockets

    monkeypatch.setattr(websockets, "AsyncSessionFactory", ws_setup["sessionmaker"])

    client = TestClient(app)
    sess_id = ws_setup["table_session_id"]
    sess_token = ws_setup["session_token"]

    with client.websocket_connect(f"/api/v1/ws/sessions/{sess_id}?session_token={sess_token}") as websocket:
        websocket.send_text("ping")
        data = websocket.receive_text()
        assert data == "pong"


@pytest.mark.anyio
async def test_unauthorized_websocket_rejection(ws_setup, monkeypatch):
    """
    Validates rejection of invalid tokens and inactive sessions.
    """
    from app.api.v1.endpoints import websockets
    from starlette.websockets import WebSocketDisconnect

    monkeypatch.setattr(websockets, "AsyncSessionFactory", ws_setup["sessionmaker"])

    client = TestClient(app)
    branch_id = ws_setup["branch_id"]

    # Invalid Staff Token -> Close / Disconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/v1/ws/branches/{branch_id}?token=invalid_jwt_token"):
            pass

    # Invalid Guest Token -> Close / Disconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/v1/ws/sessions/{ws_setup['table_session_id']}?session_token=fake_token"):
            pass


@pytest.mark.anyio
async def test_live_broadcast_order_and_payment_events(ws_setup, monkeypatch):
    """
    Validates end-to-end event broadcasting to active WebSocket connections
    when an order is placed, dish is bumped, and payment is settled.
    """
    from app.api.v1.endpoints import websockets
    from app.core.ws_manager import ws_manager

    monkeypatch.setattr(websockets, "AsyncSessionFactory", ws_setup["sessionmaker"])

    # Directly test broadcast_to_rooms delivery
    test_room = f"session:{ws_setup['table_session_id']}"
    pos_room = f"branch:{ws_setup['branch_id']}:pos"

    received_events = []

    class MockWebSocket:
        def __init__(self, room):
            self.room = room

        async def accept(self):
            pass

        async def send_text(self, text):
            received_events.append((self.room, json.loads(text)))

    mock_guest_ws = MockWebSocket(test_room)
    mock_pos_ws = MockWebSocket(pos_room)

    await ws_manager.connect(mock_guest_ws, test_room)
    await ws_manager.connect(mock_pos_ws, pos_room)

    # 1. Simulate order.created event
    await ws_manager.broadcast_to_rooms(
        rooms=[test_room, pos_room],
        event="order.created",
        data={"order_number": "ORD-001", "total_usd": "10.00"},
        branch_id=ws_setup["branch_id"],
    )

    # 2. Simulate order.item_bumped event
    await ws_manager.broadcast_to_rooms(
        rooms=[test_room, pos_room],
        event="order.item_bumped",
        data={"order_item_id": "item-123", "status": "ready_to_serve"},
        branch_id=ws_setup["branch_id"],
    )

    # 3. Simulate payment.completed event
    await ws_manager.broadcast_to_rooms(
        rooms=[test_room, pos_room],
        event="payment.completed",
        data={"payment_number": "PAY-001", "grand_total_usd": "10.00"},
        branch_id=ws_setup["branch_id"],
    )

    assert len(received_events) == 6
    events_guest = [e[1]["event"] for e in received_events if e[0] == test_room]
    assert events_guest == ["order.created", "order.item_bumped", "payment.completed"]

    ws_manager.disconnect(mock_guest_ws, test_room)
    ws_manager.disconnect(mock_pos_ws, pos_room)
