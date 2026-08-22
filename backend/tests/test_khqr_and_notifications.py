from decimal import Decimal
from unittest.mock import AsyncMock, patch
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
    PaymentMethod,
    PaymentStatus,
    StaffRole,
    TableSessionStatus,
    TableStatus,
    UserStatus,
)
from app.models.menu_item import MenuItem
from app.models.order import Order, OrderItem
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.payment import Payment
from app.models.restaurant_table import RestaurantTable
from app.models.table_session import TableSession
from app.models.user import User
from app.services.khqr_service import (
    build_khqr_payload,
    generate_qr_image_data_url,
)
from app.services.telegram_service import send_payment_telegram_notification

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def khqr_setup():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        user = User(
            id=uuid4(),
            email="cashier@khqrtest.com",
            password_hash="hash1",
            full_name="Cashier Sreymom",
            status=UserStatus.ACTIVE,
        )
        org = Organization(
            id=uuid4(),
            name="KHQR Bistro Org",
            slug="khqr-org",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add_all([user, org])
        await session.flush()

        membership = OrganizationMembership(
            organization_id=org.id,
            user_id=user.id,
            status=MembershipStatus.ACTIVE,
            role=StaffRole.CASHIER,
            is_owner=True,
        )
        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Bistro Siem Reap",
            business_type="Restaurant",
            exchange_rate=Decimal("4100.00"),
            tax_percentage=Decimal("10.00"),
            is_tax_inclusive=False,
            service_charge_percentage=Decimal("5.00"),
            is_service_charge_inclusive=False,
            bakong_account_id="bistro_sr@abab",
            bakong_merchant_name="Bistro Siem Reap",
            telegram_bot_token="123456:FAKE_TOKEN_ABC",
            telegram_chat_id="-100987654321",
            telegram_notifications_enabled=True,
            is_active=True,
        )
        branch = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Pub Street Branch",
            code="PUB01",
            exchange_rate=Decimal("4100.00"),
            bakong_account_id="bistro_pubstreet@abab",
            bakong_merchant_name="Bistro Pub Street",
            telegram_bot_token="123456:FAKE_TOKEN_ABC",
            telegram_chat_id="-100987654321",
            telegram_notifications_enabled=True,
            is_active=True,
        )
        area = DiningArea(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="Garden Terrace",
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
            table_number="T-08",
            name="Table 8",
            min_capacity=2,
            max_capacity=4,
            shape="square",
            status=TableStatus.OCCUPIED,
            qr_code_token="token-t08",
            is_active=True,
        )
        cat = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Specialties",
            display_order=1,
            is_active=True,
        )
        item1 = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=cat.id,
            name_en="Khmer Curry",
            base_price=Decimal("15.00"),
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
        ])
        await session.commit()

        # Create TableSession
        table_session = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            session_code="S-PUB08",
            session_token="guest-token-pub08",
            guest_count=2,
            status=TableSessionStatus.ACTIVE,
            opened_by_type="staff",
        )
        session.add(table_session)
        await session.commit()

        # Order: 2x Curry ($30.00) + 5% SC ($1.50) + 10% VAT ($3.15) = $34.65 (142,100 KHR)
        order = Order(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            table_session_id=table_session.id,
            order_number="#P-201",
            round_number=1,
            status=OrderStatus.CONFIRMED,
            subtotal_usd=Decimal("30.00"),
            subtotal_khr=Decimal("123000.00"),
            tax_rate_percent=Decimal("10.00"),
            tax_amount_usd=Decimal("3.15"),
            service_charge_percent=Decimal("5.00"),
            service_charge_amount_usd=Decimal("1.50"),
            total_amount_usd=Decimal("34.65"),
            total_amount_khr=Decimal("142100.00"),
        )
        item_curry = OrderItem(
            id=uuid4(),
            order_id=order.id,
            menu_item_id=item1.id,
            item_name_en=item1.name_en,
            base_unit_price=Decimal("15.00"),
            unit_price=Decimal("15.00"),
            quantity=2,
            subtotal_price=Decimal("30.00"),
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.READY_TO_SERVE,
        )
        order.items = [item_curry]
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
async def test_khqr_payload_generation_and_crc16():
    """Validates EMVCo TLV string structure, CRC16 calculation, and QR data URL generation."""
    # Test USD dynamic payload
    usd_qr = build_khqr_payload(
        bakong_account_id="bistro@abab",
        merchant_name="Bistro Pub Street",
        merchant_city="Siem Reap",
        amount=Decimal("34.65"),
        currency="USD",
        bill_number="CHK-001",
        is_dynamic=True,
    )
    assert usd_qr.startswith("000201010212")  # Format 01, Dynamic 12
    assert "bistro@abab" in usd_qr
    assert "5303840" in usd_qr  # Currency: USD 840
    assert "540534.65" in usd_qr  # Amount $34.65
    assert "5802KH" in usd_qr  # Country KH
    assert "6304" in usd_qr  # CRC16 Tag

    # Verify CRC16 is 4 characters hex
    crc = usd_qr[-4:]
    assert len(crc) == 4

    # Test KHR dynamic payload
    khr_qr = build_khqr_payload(
        bakong_account_id="bistro@abab",
        merchant_name="Bistro Pub Street",
        amount=Decimal("142100"),
        currency="KHR",
        is_dynamic=True,
    )
    assert "5303116" in khr_qr  # Currency: KHR 116
    assert "5406142100" in khr_qr  # Amount 142,100 KHR

    # Test QR image data URL
    data_url = generate_qr_image_data_url(usd_qr)
    assert data_url.startswith("data:image/png;base64,")


@pytest.mark.anyio
async def test_dynamic_table_session_khqr_endpoint(khqr_setup):
    """Tests calling the dynamic session KHQR API endpoint."""
    headers = {"Authorization": f"Bearer {khqr_setup['token']}"}

    async def override_get_db():
        async with khqr_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/businesses/{khqr_setup['business_id']}/branches/{khqr_setup['branch_id']}/khqr/table-sessions/{khqr_setup['table_session_id']}/dynamic",
            headers=headers,
            json={"currency": "USD"},
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["currency"] == "USD"
        assert Decimal(str(data["amount"])) == Decimal("34.65")
        assert data["merchant_name"] == "Bistro Pub Street"
        assert data["bakong_account_id"] == "bistro_pubstreet@abab"
        assert data["qr_string"].startswith("000201010212")
        assert data["qr_image_data_url"].startswith("data:image/png;base64,")
        assert data["deep_link_url"].startswith("bakong://qr?data=")

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_precheck_receipt_embeds_dynamic_khqr(khqr_setup):
    """
    Tests that generating a pre-check bill slip automatically embeds
    the dynamic KHQR image and renders the 'SCAN TO PAY VIA KHQR' container.
    """
    headers = {"Authorization": f"Bearer {khqr_setup['token']}"}

    async def override_get_db():
        async with khqr_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Request HTML format
        res = await client.get(
            f"/api/v1/businesses/{khqr_setup['business_id']}/branches/{khqr_setup['branch_id']}/table-sessions/{khqr_setup['table_session_id']}/pre-check?format=html&width=80mm",
            headers=headers,
        )
        assert res.status_code == status.HTTP_200_OK
        html_content = res.text
        assert "SCAN TO PAY VIA KHQR" in html_content
        assert "data:image/png;base64," in html_content
        assert "Bakong / ABA / ACLEDA / Wing" in html_content
        assert "34.65" in html_content

    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_settle_table_session_via_khqr(khqr_setup):
    """
    Tests settling a table session via KHQR:
    - Creates Payment record with payment_method='khqr'
    - Closes TableSession -> COMPLETED
    - Turns over RestaurantTable -> DIRTY_CLEANING
    - Dispatches Telegram notification
    """
    headers = {"Authorization": f"Bearer {khqr_setup['token']}"}

    async def override_get_db():
        async with khqr_setup["sessionmaker"]() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.services.payment_service.send_payment_telegram_notification", new_callable=AsyncMock) as mock_tg:
        mock_tg.return_value = True

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/businesses/{khqr_setup['business_id']}/branches/{khqr_setup['branch_id']}/table-sessions/{khqr_setup['table_session_id']}/payments/khqr",
                headers=headers,
                json={"notes": "Customer paid via ABA KHQR scan"},
            )

            assert res.status_code == status.HTTP_201_CREATED
            data = res.json()
            assert data["payment_method"] == "khqr"
            assert data["payment_status"] == "completed"
            assert Decimal(str(data["grand_total_usd"])) == Decimal("34.65")
            assert data["amount_tendered_usd"] == "34.65"
            assert Decimal(str(data["change_usd"])) == Decimal("0.00")

            # Verify Telegram dispatch was called
            assert mock_tg.called
            call_kwargs = mock_tg.call_args.kwargs
            assert call_kwargs["branch_name"] == "Pub Street Branch"
            assert "T-08" in call_kwargs["table_identifier"]

    app.dependency_overrides.clear()

    # Verify Database table status & session closure
    async with khqr_setup["sessionmaker"]() as session:
        sess_obj = await session.get(TableSession, khqr_setup["table_session_id"])
        assert sess_obj.status == TableSessionStatus.COMPLETED

        table_obj = await session.get(RestaurantTable, khqr_setup["table_id"])
        assert table_obj.status == TableStatus.DIRTY_CLEANING


@pytest.mark.anyio
async def test_telegram_notification_graceful_error_handling(khqr_setup):
    """
    Verifies that if Telegram API fails or times out, the notification returns False gracefully.
    """
    from datetime import datetime, timezone

    async with khqr_setup["sessionmaker"]() as session:
        payment = Payment(
            id=uuid4(),
            organization_id=khqr_setup["org_id"],
            business_id=khqr_setup["business_id"],
            branch_id=khqr_setup["branch_id"],
            payment_number="PAY-TEST-001",
            payment_method=PaymentMethod.CASH,
            payment_status=PaymentStatus.COMPLETED,
            bill_subtotal_usd=Decimal("20.00"),
            discount_usd=Decimal("0.00"),
            service_charge_usd=Decimal("0.00"),
            tax_usd=Decimal("0.00"),
            grand_total_usd=Decimal("20.00"),
            exchange_rate=Decimal("4100.00"),
            grand_total_khr=82000,
            amount_tendered_usd=Decimal("20.00"),
            amount_tendered_khr=0,
            total_tendered_usd=Decimal("20.00"),
            change_usd=Decimal("0.00"),
            change_khr=0,
            settled_at=datetime.now(timezone.utc),
        )

        # Mock Telegram failure (e.g. timeout or network error)
        with patch("app.services.telegram_service.httpx.AsyncClient.post", side_effect=Exception("Connection timed out")):
            result = await send_payment_telegram_notification(
                session=session,
                payment=payment,
                branch_name="Pub Street Branch",
                table_identifier="Table 08",
                cashier_name="Sreymom",
            )
            # Must return False and not raise exception
            assert result is False

