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
    StaffRole,
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
async def void_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        # Owner User
        user_owner = User(
            id=uuid4(),
            email="owner@voidtest.com",
            password_hash="hash1",
            full_name="Owner Sok",
            status=UserStatus.ACTIVE,
        )
        # Waiter User (No void permission)
        user_waiter = User(
            id=uuid4(),
            email="waiter@voidtest.com",
            password_hash="hash2",
            full_name="Waiter Dara",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            id=uuid4(),
            name="Void Org",
            slug="void-org",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([user_owner, user_waiter, org])
        await session.flush()

        membership_owner = OrganizationMembership(
            organization_id=org.id,
            user_id=user_owner.id,
            status=MembershipStatus.ACTIVE,
            role=StaffRole.OWNER,
            is_owner=True,
        )
        membership_waiter = OrganizationMembership(
            organization_id=org.id,
            user_id=user_waiter.id,
            status=MembershipStatus.ACTIVE,
            role=StaffRole.WAITER,
            is_owner=False,
        )
        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Khmer Grill",
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
            name_en="Main Branch",
            code="MB1",
            exchange_rate=Decimal("4100.00"),
            is_active=True,
        )
        vip_area = DiningArea(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="Main Dining",
            service_charge_percentage=Decimal("0.00"),
            display_order=1,
            is_active=True,
        )
        table = RestaurantTable(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            dining_area_id=vip_area.id,
            table_number="T-VOID",
            name="Table Void",
            min_capacity=2,
            max_capacity=4,
            shape="rectangle",
            status=TableStatus.OCCUPIED,
            qr_code_token="token-tvoid",
            is_active=True,
        )
        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Grill",
            display_order=1,
            is_active=True,
        )
        item1 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Grilled Pork Ribs",
            base_price=Decimal("10.00"),
            is_active=True,
        )
        item2 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Draft Beer",
            base_price=Decimal("2.00"),
            is_active=True,
        )
        session.add_all([
            membership_owner,
            membership_waiter,
            business,
            branch,
            vip_area,
            table,
            cat,
            item1,
            item2,
        ])
        await session.commit()

        # Active TableSession
        table_session = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            session_code="S-VOID01",
            session_token="guest-token-void01",
            guest_count=2,
            status=TableSessionStatus.ACTIVE,
            opened_by_type="staff",
        )
        session.add(table_session)
        await session.commit()

        # Order with 2 Items: 1x Ribs ($10.00), 2x Beer ($4.00) = Subtotal $14.00
        order = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="#V-101",
            round_number=1,
            status=OrderStatus.CONFIRMED,
            subtotal_usd=Decimal("14.00"),
            subtotal_khr=Decimal("57400.00"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=Decimal("1.40"),
            service_charge_percent=Decimal("0.00"),
            service_charge_amount_usd=Decimal("0.00"),
            total_amount_usd=Decimal("15.40"),
            total_amount_khr=Decimal("63140.00"),
        )
        item_ribs = OrderItem(
            id=uuid4(),
            order_id=order.id,
            menu_item_id=item1.id,
            item_name_en=item1.name_en,
            base_unit_price=Decimal("10.00"),
            unit_price=Decimal("10.00"),
            quantity=1,
            subtotal_price=Decimal("10.00"),
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.PREPARING,
        )
        item_beer = OrderItem(
            id=uuid4(),
            order_id=order.id,
            menu_item_id=item2.id,
            item_name_en=item2.name_en,
            base_unit_price=Decimal("2.00"),
            unit_price=Decimal("2.00"),
            quantity=2,
            subtotal_price=Decimal("4.00"),
            course_stage=CourseStage.DRINKS,
            status=OrderItemStatus.READY_TO_SERVE,
        )
        order.items = [item_ribs, item_beer]
        session.add(order)
        await session.commit()

        token_owner = create_access_token(user_owner.id)
        token_waiter = create_access_token(user_waiter.id)

    yield {
        "engine": engine,
        "sessionmaker": sessionmaker,
        "token_owner": token_owner,
        "token_waiter": token_waiter,
        "user_owner_id": user_owner.id,
        "user_waiter_id": user_waiter.id,
        "org_id": org.id,
        "business_id": business.id,
        "branch_id": branch.id,
        "table_id": table.id,
        "table_session_id": table_session.id,
        "order_id": order.id,
        "item_ribs_id": item_ribs.id,
        "item_beer_id": item_beer.id,
    }

    await engine.dispose()


@pytest.mark.anyio
async def test_authorized_owner_voids_order_item(void_setup):
    """
    Authorized manager/owner voids an order item:
    - Item status -> VOIDED
    - Reason and audit tracking captured
    - Order subtotal recalculated from $14.00 -> $4.00
    - Bill summary excludes the voided item
    """
    headers = {"Authorization": f"Bearer {void_setup['token_owner']}"}

    async def override_get_db():
        async with void_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Void the ribs item
        res = await client.post(
            f"/api/v1/businesses/{void_setup['business_id']}/branches/{void_setup['branch_id']}/orders/{void_setup['order_id']}/items/{void_setup['item_ribs_id']}/void",
            headers=headers,
            json={
                "void_reason_code": "guest_changed_mind",
                "void_reason": "Guest decided to eat vegetarian instead",
            },
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["status"] == "voided"
    assert data["void_reason_code"] == "guest_changed_mind"
    assert data["void_reason"] == "Guest decided to eat vegetarian instead"
    assert data["voided_by_user_id"] == str(void_setup["user_owner_id"])
    assert data["voided_at"] is not None

    # Check Database and Audit Log
    async with void_setup["sessionmaker"]() as session:
        ord_obj = await session.get(Order, void_setup["order_id"])
        assert ord_obj.subtotal_usd == Decimal("4.00")  # Only beer remaining
        assert ord_obj.status == OrderStatus.CONFIRMED

        # Verify Audit Log
        logs_res = await session.execute(
            select(AuditLog).where(
                AuditLog.action == "order_item.voided",
                AuditLog.resource_id == str(void_setup["item_ribs_id"]),
            )
        )
        log = logs_res.scalar_one_or_none()
        assert log is not None
        assert log.details["void_reason_code"] == "guest_changed_mind"
        assert log.details["item_name_en"] == "Grilled Pork Ribs"


@pytest.mark.anyio
async def test_unauthorized_waiter_cannot_void_item(void_setup):
    """
    Verifies that a waiter role cannot void items and receives HTTP 403 Forbidden.
    """
    headers = {"Authorization": f"Bearer {void_setup['token_waiter']}"}

    async def override_get_db():
        async with void_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/businesses/{void_setup['business_id']}/branches/{void_setup['branch_id']}/orders/{void_setup['order_id']}/items/{void_setup['item_ribs_id']}/void",
            headers=headers,
            json={"void_reason_code": "order_entry_mistake"},
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_403_FORBIDDEN
    assert "Unauthorized" in res.json()["detail"]


@pytest.mark.anyio
async def test_cancel_entire_order_round(void_setup):
    """
    Tests cancelling an entire order round:
    - Order status -> CANCELLED
    - All child items -> VOIDED
    - Totals set to $0.00
    - Audit log recorded
    """
    headers = {"Authorization": f"Bearer {void_setup['token_owner']}"}

    async def override_get_db():
        async with void_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/businesses/{void_setup['business_id']}/branches/{void_setup['branch_id']}/orders/{void_setup['order_id']}/cancel",
            headers=headers,
            json={
                "cancel_reason_code": "out_of_stock",
                "cancel_reason": "Kitchen ran out of meat and gas",
            },
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["status"] == "cancelled"
    assert data["cancel_reason_code"] == "out_of_stock"
    assert data["voided_item_count"] == 2

    # Verify Database
    async with void_setup["sessionmaker"]() as session:
        ord_obj = await session.get(Order, void_setup["order_id"])
        assert ord_obj.status == OrderStatus.CANCELLED
        assert ord_obj.subtotal_usd == Decimal("0.00")

        # Verify audit log
        logs_res = await session.execute(
            select(AuditLog).where(
                AuditLog.action == "order.cancelled",
                AuditLog.resource_id == str(void_setup["order_id"]),
            )
        )
        assert logs_res.scalar_one_or_none() is not None


@pytest.mark.anyio
async def test_cannot_void_items_on_settled_session(void_setup):
    """
    Verifies that attempting to void items on an already completed table session returns HTTP 409 Conflict.
    """
    headers = {"Authorization": f"Bearer {void_setup['token_owner']}"}

    # Mark TableSession as COMPLETED
    async with void_setup["sessionmaker"]() as session:
        sess = await session.get(TableSession, void_setup["table_session_id"])
        sess.status = TableSessionStatus.COMPLETED
        await session.commit()

    async def override_get_db():
        async with void_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/businesses/{void_setup['business_id']}/branches/{void_setup['branch_id']}/orders/{void_setup['order_id']}/items/{void_setup['item_ribs_id']}/void",
            headers=headers,
            json={"void_reason_code": "order_entry_mistake"},
        )

    app.dependency_overrides.clear()

    assert res.status_code == status.HTTP_409_CONFLICT
    assert "already settled" in res.json()["detail"]
