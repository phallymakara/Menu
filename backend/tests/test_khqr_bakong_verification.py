"""KHQR payments settle only after Bakong confirms them, or by an audited override."""

import hashlib
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Select, event, func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import ORMExecuteState, Session

from app.api.dependencies.bakong import get_bakong_client
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
    KHQRPaymentAttemptStatus,
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
from app.models.khqr_payment_attempt import KHQRPaymentAttempt
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
    calculate_crc16,
    compute_khqr_md5,
)
from app.services.telegram_service import send_payment_telegram_notification
from tests.bakong_fakes import FAKE_BAKONG_TOKEN, FakeBakong

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Session bill: 2 x $15.00 + 5% service charge + 10% VAT = $34.65 (142,100 KHR).
SESSION_TOTAL_USD = Decimal("34.65")
SESSION_TOTAL_KHR = 142100

STAFF = {
    "owner": (StaffRole.OWNER, True),
    "manager": (StaffRole.MANAGER, False),
    "branch_manager": (StaffRole.MANAGER, False),
    "cashier": (StaffRole.CASHIER, False),
    "waiter": (StaffRole.WAITER, False),
}


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _order(
    org_id: UUID,
    business_id: UUID,
    branch_id: UUID,
    item: MenuItem,
    *,
    order_number: str,
    quantity: int,
    table_id: UUID | None = None,
    table_session_id: UUID | None = None,
) -> Order:
    """An order of ``quantity`` units of ``item``."""
    subtotal = item.base_price * quantity
    order = Order(
        id=uuid4(),
        organization_id=org_id,
        business_id=business_id,
        branch_id=branch_id,
        table_id=table_id,
        table_session_id=table_session_id,
        order_number=order_number,
        round_number=1,
        status=OrderStatus.CONFIRMED,
        subtotal_usd=subtotal,
        subtotal_khr=subtotal * 4100,
        tax_rate_percent=Decimal("10.00"),
        tax_amount_usd=Decimal("0.00"),
        service_charge_percent=Decimal("5.00"),
        service_charge_amount_usd=Decimal("0.00"),
        total_amount_usd=subtotal,
        total_amount_khr=subtotal * 4100,
    )
    order.items = [
        OrderItem(
            id=uuid4(),
            order_id=order.id,
            menu_item_id=item.id,
            item_name_en=item.name_en,
            base_unit_price=item.base_price,
            unit_price=item.base_price,
            quantity=quantity,
            subtotal_price=subtotal,
            course_stage=CourseStage.MAINS,
            status=OrderItemStatus.READY_TO_SERVE,
        )
    ]
    return order


@pytest.fixture
async def env():
    """A branch with an open table session, a takeaway order and one user per role."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        org = Organization(
            id=uuid4(),
            name="Verify Org",
            slug="verify-org",
            status=OrganizationStatus.ACTIVE,
            is_active=True,
        )
        session.add(org)
        await session.flush()

        business = Business(
            id=uuid4(),
            organization_id=org.id,
            name_en="Verify Bistro",
            business_type="Restaurant",
            exchange_rate=Decimal("4100.00"),
            tax_percentage=Decimal("10.00"),
            is_tax_inclusive=False,
            service_charge_percentage=Decimal("5.00"),
            is_service_charge_inclusive=False,
            bakong_account_id="verify_bistro@abab",
            bakong_merchant_name="Verify Bistro",
            is_active=True,
        )
        branch = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Riverside",
            code="RIV01",
            exchange_rate=Decimal("4100.00"),
            is_active=True,
        )
        other_branch = Branch(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Airport",
            code="AIR01",
            exchange_rate=Decimal("4100.00"),
            is_active=True,
        )
        area = DiningArea(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            name_en="Terrace",
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
            table_number="T-05",
            name="Table 5",
            min_capacity=2,
            max_capacity=4,
            shape="square",
            status=TableStatus.OCCUPIED,
            qr_code_token="token-verify-t05",
            is_active=True,
        )
        category = Category(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            name_en="Mains",
            display_order=1,
            is_active=True,
        )
        item = MenuItem(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            category_id=category.id,
            name_en="Lok Lak",
            base_price=Decimal("15.00"),
            is_active=True,
        )
        session.add_all([business, branch, other_branch, area, table, category, item])
        await session.flush()

        tokens: dict[str, str] = {}
        user_ids: dict[str, UUID] = {}
        for key, (role, is_owner) in STAFF.items():
            user = User(
                id=uuid4(),
                email=f"{key}@verify.test",
                password_hash="not-used",
                full_name=f"{key} member",
                status=UserStatus.ACTIVE,
            )
            session.add(user)
            await session.flush()
            session.add(
                OrganizationMembership(
                    organization_id=org.id,
                    user_id=user.id,
                    role=role,
                    status=MembershipStatus.ACTIVE,
                    is_owner=is_owner,
                    branch_id=other_branch.id if key == "branch_manager" else None,
                )
            )
            tokens[key] = create_access_token(user.id)
            user_ids[key] = user.id

        table_session = TableSession(
            id=uuid4(),
            organization_id=org.id,
            business_id=business.id,
            branch_id=branch.id,
            table_id=table.id,
            session_code="S-VER05",
            session_token="guest-token-verify-05",
            guest_count=2,
            status=TableSessionStatus.ACTIVE,
            opened_by_type="staff",
        )
        session.add(table_session)
        await session.flush()

        session.add(
            _order(
                org.id,
                business.id,
                branch.id,
                item,
                order_number="#V-1",
                quantity=2,
                table_id=table.id,
                table_session_id=table_session.id,
            )
        )
        takeaway = _order(
            org.id, business.id, branch.id, item, order_number="#TK-1", quantity=1
        )
        session.add(takeaway)
        await session.commit()

    bakong = FakeBakong()

    async def override_get_db():
        async with sessionmaker() as s:
            yield s

    app.dependency_overrides[get_db_session] = override_get_db
    app.dependency_overrides[get_bakong_client] = bakong.client

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield {
            "client": client,
            "bakong": bakong,
            "sessionmaker": sessionmaker,
            "tokens": tokens,
            "user_ids": user_ids,
            "org_id": org.id,
            "business_id": business.id,
            "branch_id": branch.id,
            "table_id": table.id,
            "table_session_id": table_session.id,
            "order_id": takeaway.id,
            "item": item,
            "base": f"/api/v1/businesses/{business.id}/branches/{branch.id}",
        }

    app.dependency_overrides.clear()
    await engine.dispose()


def _auth(env: dict, role: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {env['tokens'][role]}"}


def _bill_path(env: dict, target: str) -> str:
    if target == "order":
        return f"orders/{env['order_id']}"
    return f"table-sessions/{env['table_session_id']}"


async def _generate(
    env: dict, *, role: str = "cashier", target: str = "session", **body
) -> httpx.Response:
    """POST the dynamic KHQR endpoint for the session or the takeaway order."""
    return await env["client"].post(
        f"{env['base']}/khqr/{_bill_path(env, target)}/dynamic",
        headers=_auth(env, role),
        json={"currency": "USD", **body},
    )


async def _generated_attempt(env: dict, **kwargs) -> dict:
    res = await _generate(env, **kwargs)
    assert res.status_code == status.HTTP_201_CREATED, res.text
    return res.json()


async def _settle(
    env: dict, attempt_id: str, *, role: str = "cashier", target: str = "session"
) -> httpx.Response:
    return await env["client"].post(
        f"{env['base']}/{_bill_path(env, target)}/payments/khqr",
        headers=_auth(env, role),
        json={"attempt_id": attempt_id},
    )


async def _confirm_manually(
    env: dict, body: dict, *, role: str = "manager", target: str = "session"
) -> httpx.Response:
    return await env["client"].post(
        f"{env['base']}/{_bill_path(env, target)}/payments/khqr/manual-confirmation",
        headers=_auth(env, role),
        json=body,
    )


async def _attempt(env: dict, attempt_id: str) -> KHQRPaymentAttempt:
    async with env["sessionmaker"]() as s:
        attempt = await s.get(KHQRPaymentAttempt, UUID(attempt_id))
        assert attempt is not None
        return attempt


async def _payment_count(env: dict) -> int:
    async with env["sessionmaker"]() as s:
        return (await s.execute(select(func.count()).select_from(Payment))).scalar_one()


async def _session_status(env: dict) -> str:
    async with env["sessionmaker"]() as s:
        table_session = await s.get(TableSession, env["table_session_id"])
        assert table_session is not None
        return table_session.status


async def _expire(env: dict, attempt_id: str) -> None:
    async with env["sessionmaker"]() as s:
        attempt = await s.get(KHQRPaymentAttempt, UUID(attempt_id))
        assert attempt is not None
        attempt.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await s.commit()


# ------------------------------------------------------------------------------
# KHQR payload, MD5 and expiration
# ------------------------------------------------------------------------------


def test_md5_and_crc_match_the_official_khqr_sdk_sample():
    """MD5 and CRC16 reproduce the sample published in the NBC KHQR SDK document."""
    sample = (
        "00020101021215311234567812345678ABCDEFGHIJKLMNO29460015john_smith@devb"
        "0111855122334550208Dev Bank52041234530311654031005802KH5910John Smith"
        "6010PHNOM PENH62670106#123450211855122334550311Coffee Shop0709Cashier_1"
        "0810Buy coffee64290002km0108ចន ស្មីន0207ភ្នំពេញ"
        "993400131745915488053011341013543270006304FD7B"
    )
    assert compute_khqr_md5(sample) == "9dc0fe3e9ea50b99ddccd47055333ed8"
    assert calculate_crc16(sample[:-4]) == "FD7B"


def test_dynamic_payload_carries_creation_and_expiration_timestamps():
    """Tag 99 holds the creation and expiration time in epoch milliseconds."""
    created = datetime(2025, 4, 29, 8, 31, 28, 53000, tzinfo=timezone.utc)
    expires = created + timedelta(minutes=10)
    payload = build_khqr_payload(
        bakong_account_id="bistro@abab",
        merchant_name="Bistro",
        amount=Decimal("34.65"),
        currency="USD",
        created_at=created,
        expires_at=expires,
    )
    created_ms = int(created.timestamp() * 1000)
    expires_ms = created_ms + 600_000
    assert f"99340013{created_ms}0113{expires_ms}6304" in payload
    assert calculate_crc16(payload[:-4]) == payload[-4:]

    with pytest.raises(ValueError):
        build_khqr_payload(
            bakong_account_id="bistro@abab",
            merchant_name="Bistro",
            amount=Decimal("1.00"),
            created_at=created,
            expires_at=created,
        )


# ------------------------------------------------------------------------------
# Attempt creation
# ------------------------------------------------------------------------------


@pytest.mark.anyio
async def test_generating_a_khqr_records_a_pending_attempt(env):
    data = await _generated_attempt(env)

    assert data["status"] == "pending"
    assert Decimal(data["amount"]) == SESSION_TOTAL_USD
    assert data["md5"] == hashlib.md5(data["qr_string"].encode("utf-8")).hexdigest()
    assert data["bill_reference"].startswith(
        f"SES-{env['table_session_id'].hex[:8].upper()}-"
    )

    attempt = await _attempt(env, data["attempt_id"])
    assert attempt.organization_id == env["org_id"]
    assert attempt.business_id == env["business_id"]
    assert attempt.branch_id == env["branch_id"]
    assert attempt.table_session_id == env["table_session_id"]
    assert attempt.order_id is None
    assert attempt.amount == SESSION_TOTAL_USD
    assert attempt.currency == "USD"
    assert attempt.qr_payload == data["qr_string"]
    assert attempt.md5 == data["md5"]
    assert attempt.created_by_user_id == env["user_ids"]["cashier"]
    assert attempt.bakong_reference is None and attempt.verified_at is None
    expires_at = attempt.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    lifetime = expires_at - datetime.now(timezone.utc)
    assert timedelta(minutes=9) < lifetime <= timedelta(minutes=10)

    # Each KHQR is unique, so a second one for the same bill has its own MD5.
    second = await _generated_attempt(env)
    assert second["md5"] != data["md5"]
    assert second["attempt_id"] != data["attempt_id"]


@pytest.mark.anyio
async def test_khr_attempt_charges_whole_riel(env):
    data = await _generated_attempt(env, currency="KHR")

    assert data["currency"] == "KHR"
    assert Decimal(data["amount"]) == SESSION_TOTAL_KHR
    assert f"5406{SESSION_TOTAL_KHR}" in data["qr_string"]
    assert (await _attempt(env, data["attempt_id"])).amount == SESSION_TOTAL_KHR


@pytest.mark.anyio
async def test_no_bakong_account_refuses_khqr(env):
    """No invented merchant account: without a Bakong account, KHQR is refused."""
    async with env["sessionmaker"]() as s:
        business = await s.get(Business, env["business_id"])
        branch = await s.get(Branch, env["branch_id"])
        assert business is not None and branch is not None
        business.bakong_account_id = None
        branch.bakong_account_id = "   "
        await s.commit()

    for target in ("session", "order"):
        res = await _generate(env, target=target)
        assert res.status_code == status.HTTP_409_CONFLICT
        assert "No Bakong account is configured" in res.json()["detail"]

    static = await env["client"].get(
        f"{env['base']}/khqr/static", headers=_auth(env, "cashier")
    )
    assert static.status_code == status.HTTP_409_CONFLICT

    async with env["sessionmaker"]() as s:
        count = (
            await s.execute(select(func.count()).select_from(KHQRPaymentAttempt))
        ).scalar_one()
        assert count == 0

    # A pre-check slip still prints, without a QR code.
    precheck = await env["client"].get(
        f"{env['base']}/table-sessions/{env['table_session_id']}/pre-check?format=html",
        headers=_auth(env, "cashier"),
    )
    assert precheck.status_code == status.HTTP_200_OK
    assert "SCAN TO PAY VIA KHQR" not in precheck.text


@pytest.mark.anyio
async def test_settled_session_cannot_get_a_new_khqr(env):
    async with env["sessionmaker"]() as s:
        table_session = await s.get(TableSession, env["table_session_id"])
        assert table_session is not None
        table_session.status = TableSessionStatus.COMPLETED
        await s.commit()

    res = await _generate(env)
    assert res.status_code == status.HTTP_409_CONFLICT
    assert "already been settled" in res.json()["detail"]


# ------------------------------------------------------------------------------
# Settlement through Bakong
# ------------------------------------------------------------------------------


@pytest.mark.anyio
async def test_settles_only_after_bakong_confirms_the_payment(env):
    data = await _generated_attempt(env)
    bakong_hash = env["bakong"].mark_paid(
        data["md5"], amount=SESSION_TOTAL_USD, currency="USD"
    )

    res = await _settle(env, data["attempt_id"])

    assert res.status_code == status.HTTP_201_CREATED, res.text
    payment = res.json()
    assert payment["payment_method"] == "khqr"
    assert Decimal(payment["grand_total_usd"]) == SESSION_TOTAL_USD
    assert payment["bakong_reference"] == bakong_hash
    assert payment["is_manually_confirmed"] is False

    # Bakong was asked once, with the attempt's MD5 and the bearer token.
    [request] = env["bakong"].requests
    assert request.url.path == "/v1/check_transaction_by_md5"
    assert request.headers["Authorization"] == f"Bearer {FAKE_BAKONG_TOKEN}"
    assert request.content == f'{{"md5":"{data["md5"]}"}}'.encode()

    attempt = await _attempt(env, data["attempt_id"])
    assert attempt.status == KHQRPaymentAttemptStatus.SUCCEEDED
    assert attempt.bakong_reference == bakong_hash
    assert attempt.verified_at is not None
    assert attempt.payment_id == UUID(payment["id"])

    async with env["sessionmaker"]() as s:
        table_session = await s.get(TableSession, env["table_session_id"])
        table = await s.get(RestaurantTable, env["table_id"])
        stored = await s.get(Payment, UUID(payment["id"]))
        assert table_session is not None and table is not None and stored is not None
        assert table_session.status == TableSessionStatus.COMPLETED
        assert table.status == TableStatus.DIRTY_CLEANING
        assert stored.bakong_reference == bakong_hash
        audit = (
            await s.execute(
                select(AuditLog).where(
                    AuditLog.action == "payment.settled",
                    AuditLog.resource_id == payment["id"],
                )
            )
        ).scalar_one()
        assert audit.details["method"] == "khqr"
        assert audit.details["verification"] == "bakong"
        assert audit.details["bakong_reference"] == bakong_hash
        assert audit.details["khqr_attempt_id"] == data["attempt_id"]


@pytest.mark.anyio
async def test_settles_khr_attempt(env):
    data = await _generated_attempt(env, currency="KHR")
    env["bakong"].mark_paid(data["md5"], amount=SESSION_TOTAL_KHR, currency="KHR")

    res = await _settle(env, data["attempt_id"])

    assert res.status_code == status.HTTP_201_CREATED, res.text
    assert res.json()["grand_total_khr"] == SESSION_TOTAL_KHR


@pytest.mark.anyio
async def test_settles_takeaway_order_after_bakong_confirms(env):
    data = await _generated_attempt(env, target="order")
    assert data["bill_reference"].startswith("ORD-")
    env["bakong"].mark_paid(data["md5"], amount=data["amount"], currency="USD")

    res = await _settle(env, data["attempt_id"], target="order")

    assert res.status_code == status.HTTP_201_CREATED, res.text
    assert res.json()["order_id"] == str(env["order_id"])
    async with env["sessionmaker"]() as s:
        order = await s.get(Order, env["order_id"])
        assert order is not None
        assert order.status == OrderStatus.SERVED


@pytest.mark.anyio
async def test_payment_not_received_yet_returns_409_and_can_be_retried(env):
    data = await _generated_attempt(env)

    first = await _settle(env, data["attempt_id"])

    assert first.status_code == status.HTTP_409_CONFLICT
    assert "Payment not received yet" in first.json()["detail"]
    assert (await _attempt(env, data["attempt_id"])).status == "pending"
    assert await _payment_count(env) == 0
    assert await _session_status(env) == TableSessionStatus.ACTIVE

    env["bakong"].mark_paid(data["md5"], amount=SESSION_TOTAL_USD, currency="USD")
    retry = await _settle(env, data["attempt_id"])
    assert retry.status_code == status.HTTP_201_CREATED


@pytest.mark.anyio
async def test_expired_unpaid_attempt_is_refused(env):
    data = await _generated_attempt(env)
    await _expire(env, data["attempt_id"])

    res = await _settle(env, data["attempt_id"])

    assert res.status_code == status.HTTP_409_CONFLICT
    assert "expired" in res.json()["detail"]
    assert (await _attempt(env, data["attempt_id"])).status == "expired"
    assert await _payment_count(env) == 0

    # Expired is final: settling again does not ask Bakong again.
    env["bakong"].mark_paid(data["md5"], amount=SESSION_TOTAL_USD, currency="USD")
    again = await _settle(env, data["attempt_id"])
    assert again.status_code == status.HTTP_409_CONFLICT
    assert len(env["bakong"].requests) == 1


@pytest.mark.anyio
async def test_payment_made_before_expiry_is_accepted_after_it(env):
    """Banking apps refuse expired KHQR, so a payment Bakong reports was made in time."""
    data = await _generated_attempt(env)
    await _expire(env, data["attempt_id"])
    env["bakong"].mark_paid(data["md5"], amount=SESSION_TOTAL_USD, currency="USD")

    res = await _settle(env, data["attempt_id"])

    assert res.status_code == status.HTTP_201_CREATED, res.text


@pytest.mark.anyio
async def test_bill_changed_after_khqr_is_an_amount_mismatch(env):
    data = await _generated_attempt(env)
    async with env["sessionmaker"]() as s:
        s.add(
            _order(
                env["org_id"],
                env["business_id"],
                env["branch_id"],
                env["item"],
                order_number="#V-2",
                quantity=1,
                table_id=env["table_id"],
                table_session_id=env["table_session_id"],
            )
        )
        await s.commit()
    env["bakong"].mark_paid(data["md5"], amount=SESSION_TOTAL_USD, currency="USD")

    res = await _settle(env, data["attempt_id"])

    assert res.status_code == status.HTTP_409_CONFLICT
    assert "no longer matches" in res.json()["detail"]
    assert env["bakong"].requests == []
    assert await _payment_count(env) == 0


@pytest.mark.anyio
async def test_bakong_amount_or_currency_mismatch_fails_the_attempt(env):
    data = await _generated_attempt(env)
    env["bakong"].mark_paid(data["md5"], amount=Decimal("1.00"), currency="USD")

    res = await _settle(env, data["attempt_id"])

    assert res.status_code == status.HTTP_409_CONFLICT
    attempt = await _attempt(env, data["attempt_id"])
    assert attempt.status == KHQRPaymentAttemptStatus.FAILED
    assert attempt.failure_reason == "bakong_amount_mismatch"
    assert await _payment_count(env) == 0

    khr = await _generated_attempt(env)
    env["bakong"].mark_paid(khr["md5"], amount=SESSION_TOTAL_USD, currency="KHR")
    res_khr = await _settle(env, khr["attempt_id"])
    assert res_khr.status_code == status.HTTP_409_CONFLICT
    assert (await _attempt(env, khr["attempt_id"])).status == "failed"


@pytest.mark.anyio
async def test_bakong_failed_transaction_fails_the_attempt(env):
    data = await _generated_attempt(env)
    env["bakong"].mark_failed(data["md5"])

    res = await _settle(env, data["attempt_id"])

    assert res.status_code == status.HTTP_409_CONFLICT
    assert "failed" in res.json()["detail"]
    attempt = await _attempt(env, data["attempt_id"])
    assert attempt.status == KHQRPaymentAttemptStatus.FAILED
    assert attempt.failure_reason == "bakong_reported_failure"


@pytest.mark.anyio
async def test_attempt_must_belong_to_the_bill(env):
    order_attempt = await _generated_attempt(env, target="order")

    wrong_bill = await _settle(env, order_attempt["attempt_id"])
    assert wrong_bill.status_code == status.HTTP_409_CONFLICT
    assert "different bill" in wrong_bill.json()["detail"]

    unknown = await _settle(env, str(uuid4()))
    assert unknown.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.anyio
async def test_unconfigured_or_unreachable_bakong_returns_503(env):
    data = await _generated_attempt(env)

    app.dependency_overrides[get_bakong_client] = lambda: None
    not_configured = await _settle(env, data["attempt_id"])
    assert not_configured.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert "not configured" in not_configured.json()["detail"]

    app.dependency_overrides[get_bakong_client] = env["bakong"].client
    env["bakong"].error = httpx.ConnectTimeout("timed out")
    timeout = await _settle(env, data["attempt_id"])
    assert timeout.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    env["bakong"].error = None
    env["bakong"].raw_response = httpx.Response(502, text="<html>Bad gateway</html>")
    bad_gateway = await _settle(env, data["attempt_id"])
    assert bad_gateway.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    for res in (timeout, bad_gateway):
        assert FAKE_BAKONG_TOKEN not in res.text
        assert "Bad gateway" not in res.text

    assert (await _attempt(env, data["attempt_id"])).status == "pending"
    assert await _payment_count(env) == 0


# ------------------------------------------------------------------------------
# Attempt status refresh
# ------------------------------------------------------------------------------


@pytest.mark.anyio
async def test_attempt_status_refreshes_from_bakong_without_settling(env):
    data = await _generated_attempt(env)
    url = f"{env['base']}/khqr/attempts/{data['attempt_id']}"

    pending = await env["client"].get(url, headers=_auth(env, "cashier"))
    assert pending.status_code == status.HTTP_200_OK
    assert pending.json()["status"] == "pending"
    assert pending.json()["verification_available"] is True

    bakong_hash = env["bakong"].mark_paid(
        data["md5"], amount=SESSION_TOTAL_USD, currency="USD"
    )
    paid = await env["client"].get(url, headers=_auth(env, "cashier"))
    assert paid.status_code == status.HTTP_200_OK
    body = paid.json()
    assert body["status"] == "succeeded"
    assert body["bakong_reference"] == bakong_hash
    assert body["verified_at"] is not None
    assert body["payment_id"] is None
    assert "qr_payload" not in body
    assert await _payment_count(env) == 0
    assert await _session_status(env) == TableSessionStatus.ACTIVE

    # Settling a confirmed attempt needs no new Bakong call.
    calls_before = len(env["bakong"].requests)
    settled = await _settle(env, data["attempt_id"])
    assert settled.status_code == status.HTTP_201_CREATED
    assert settled.json()["bakong_reference"] == bakong_hash
    assert len(env["bakong"].requests) == calls_before

    final = await env["client"].get(url, headers=_auth(env, "cashier"))
    assert final.json()["payment_id"] == settled.json()["id"]


@pytest.mark.anyio
async def test_attempt_refresh_marks_expired_and_reports_missing_token(env):
    data = await _generated_attempt(env)
    url = f"{env['base']}/khqr/attempts/{data['attempt_id']}"
    await _expire(env, data["attempt_id"])

    app.dependency_overrides[get_bakong_client] = lambda: None
    unverified = await env["client"].get(url, headers=_auth(env, "cashier"))
    assert unverified.status_code == status.HTTP_200_OK
    assert unverified.json()["status"] == "pending"
    assert unverified.json()["verification_available"] is False

    app.dependency_overrides[get_bakong_client] = env["bakong"].client
    expired = await env["client"].get(url, headers=_auth(env, "cashier"))
    assert expired.json()["status"] == "expired"

    missing = await env["client"].get(
        f"{env['base']}/khqr/attempts/{uuid4()}", headers=_auth(env, "cashier")
    )
    assert missing.status_code == status.HTTP_404_NOT_FOUND


# ------------------------------------------------------------------------------
# Double settlement
# ------------------------------------------------------------------------------


@pytest.mark.anyio
async def test_attempt_and_session_cannot_be_settled_twice(env):
    first_attempt = await _generated_attempt(env)
    second_attempt = await _generated_attempt(env)
    for attempt in (first_attempt, second_attempt):
        env["bakong"].mark_paid(
            attempt["md5"], amount=SESSION_TOTAL_USD, currency="USD"
        )

    settled = await _settle(env, first_attempt["attempt_id"])
    assert settled.status_code == status.HTTP_201_CREATED

    same_attempt = await _settle(env, first_attempt["attempt_id"])
    assert same_attempt.status_code == status.HTTP_409_CONFLICT

    other_attempt = await _settle(env, second_attempt["attempt_id"])
    assert other_attempt.status_code == status.HTTP_409_CONFLICT
    assert "already been settled" in other_attempt.json()["detail"]

    manual = await _confirm_manually(
        env, {"reason": "Customer showed the receipt again"}
    )
    assert manual.status_code == status.HTTP_409_CONFLICT

    # Even if the session were reopened, an attempt never pays a second bill.
    async with env["sessionmaker"]() as s:
        table_session = await s.get(TableSession, env["table_session_id"])
        assert table_session is not None
        table_session.status = TableSessionStatus.ACTIVE
        await s.commit()
    reused = await _settle(env, first_attempt["attempt_id"])
    assert reused.status_code == status.HTTP_409_CONFLICT
    assert "attempt has already been settled" in reused.json()["detail"]
    reused_manually = await _confirm_manually(
        env,
        {"reason": "Customer paid twice", "attempt_id": first_attempt["attempt_id"]},
    )
    assert reused_manually.status_code == status.HTTP_409_CONFLICT

    assert await _payment_count(env) == 1


@pytest.mark.anyio
async def test_settlement_locks_session_and_attempt_rows(env):
    """Settlement reads the session and the attempt with SELECT ... FOR UPDATE."""
    data = await _generated_attempt(env)
    env["bakong"].mark_paid(data["md5"], amount=SESSION_TOTAL_USD, currency="USD")

    statements: list[str] = []

    def capture(state: ORMExecuteState) -> None:
        if isinstance(state.statement, Select):
            statements.append(
                str(state.statement.compile(dialect=postgresql.dialect()))
            )

    event.listen(Session, "do_orm_execute", capture)
    try:
        res = await _settle(env, data["attempt_id"])
    finally:
        event.remove(Session, "do_orm_execute", capture)

    assert res.status_code == status.HTTP_201_CREATED
    locked = [sql for sql in statements if sql.rstrip().endswith("FOR UPDATE")]
    assert any("FROM table_sessions" in sql for sql in locked)
    assert any("FROM khqr_payment_attempts" in sql for sql in locked)


# ------------------------------------------------------------------------------
# Manual confirmation (audited override)
# ------------------------------------------------------------------------------


@pytest.mark.anyio
async def test_manual_confirmation_requires_owner_or_manager(env):
    data = await _generated_attempt(env)
    body = {"reason": "Bakong token not set up yet", "attempt_id": data["attempt_id"]}

    cashier = await _confirm_manually(env, body, role="cashier")
    assert cashier.status_code == status.HTTP_403_FORBIDDEN

    other_branch = await _confirm_manually(env, body, role="branch_manager")
    assert other_branch.status_code == status.HTTP_403_FORBIDDEN

    assert await _payment_count(env) == 0
    assert await _session_status(env) == TableSessionStatus.ACTIVE


@pytest.mark.anyio
async def test_manual_confirmation_is_audited_and_flagged(env):
    app.dependency_overrides[get_bakong_client] = lambda: None
    data = await _generated_attempt(env)
    reason = "Checked the ABA app: payment received"

    res = await _confirm_manually(
        env, {"reason": f"  {reason}  ", "attempt_id": data["attempt_id"]}
    )

    assert res.status_code == status.HTTP_201_CREATED, res.text
    payment = res.json()
    assert payment["payment_method"] == "khqr"
    assert payment["is_manually_confirmed"] is True
    assert payment["manual_confirmation_reason"] == reason
    assert payment["bakong_reference"] is None
    assert payment["received_by_user_id"] == str(env["user_ids"]["manager"])
    assert await _session_status(env) == TableSessionStatus.COMPLETED

    attempt = await _attempt(env, data["attempt_id"])
    assert attempt.status == KHQRPaymentAttemptStatus.SUCCEEDED
    assert attempt.payment_id == UUID(payment["id"])
    assert attempt.verified_at is None

    async with env["sessionmaker"]() as s:
        audit = (
            await s.execute(
                select(AuditLog).where(
                    AuditLog.action == "payment.khqr_manual_override",
                    AuditLog.resource_id == payment["id"],
                )
            )
        ).scalar_one()
        assert audit.user_id == env["user_ids"]["manager"]
        assert audit.details["manual_override"] is True
        assert audit.details["reason"] == reason
        assert audit.details["confirmed_by_role"] == "manager"
        assert audit.details["verification"] == "manual_override"
        assert audit.details["khqr_attempt_id"] == data["attempt_id"]
        assert audit.details["attempt_status_before_override"] == "pending"

    fetched = await env["client"].get(
        f"{env['base']}/payments/{payment['id']}", headers=_auth(env, "cashier")
    )
    assert fetched.json()["is_manually_confirmed"] is True


@pytest.mark.anyio
async def test_manual_confirmation_without_attempt_for_order(env):
    """An owner can confirm a payment made to a static or printed KHQR."""
    res = await _confirm_manually(
        env,
        {"reason": "Paid to the counter sticker KHQR"},
        role="owner",
        target="order",
    )

    assert res.status_code == status.HTTP_201_CREATED, res.text
    assert res.json()["is_manually_confirmed"] is True
    async with env["sessionmaker"]() as s:
        order = await s.get(Order, env["order_id"])
        assert order is not None
        assert order.status == OrderStatus.SERVED


@pytest.mark.anyio
async def test_telegram_message_flags_manual_confirmation(env):
    """Staff are told on Telegram that Bakong did not verify a manual confirmation."""
    async with env["sessionmaker"]() as s:
        business = await s.get(Business, env["business_id"])
        assert business is not None
        business.telegram_bot_token = "123456:TEST_ONLY"
        business.telegram_chat_id = "-100123"
        business.telegram_notifications_enabled = True
        await s.commit()

    sent: list[str] = []

    async def fake_post(self, url, json: dict, **kwargs):
        sent.append(json["text"])
        return httpx.Response(200)

    async with env["sessionmaker"]() as s:
        payment = Payment(
            organization_id=env["org_id"],
            business_id=env["business_id"],
            branch_id=env["branch_id"],
            payment_number="PAY-TEST-MANUAL",
            payment_method=PaymentMethod.KHQR,
            payment_status=PaymentStatus.COMPLETED,
            discount_usd=Decimal("0.00"),
            grand_total_usd=SESSION_TOTAL_USD,
            exchange_rate=Decimal("4100.00"),
            grand_total_khr=SESSION_TOTAL_KHR,
            total_tendered_usd=SESSION_TOTAL_USD,
            is_manually_confirmed=True,
            settled_at=datetime.now(timezone.utc),
        )
        with patch("app.services.telegram_service.httpx.AsyncClient.post", fake_post):
            assert await send_payment_telegram_notification(
                session=s, payment=payment, branch_name="Riverside"
            )

    assert "manually confirmed, not verified by Bakong" in sent[0]


@pytest.mark.anyio
async def test_manual_confirmation_validates_reason_and_attempt(env):
    missing = await _confirm_manually(env, {})
    assert missing.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    blank = await _confirm_manually(env, {"reason": "   ok   "})
    assert blank.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    order_attempt = await _generated_attempt(env, target="order")
    wrong_bill = await _confirm_manually(
        env,
        {"reason": "Customer paid", "attempt_id": order_attempt["attempt_id"]},
    )
    assert wrong_bill.status_code == status.HTTP_409_CONFLICT

    session_attempt = await _generated_attempt(
        env, manual_discount_type="fixed_amount", manual_discount_value="5.00"
    )
    mismatch = await _confirm_manually(
        env,
        {"reason": "Customer paid", "attempt_id": session_attempt["attempt_id"]},
    )
    assert mismatch.status_code == status.HTTP_409_CONFLICT
    assert "no longer matches" in mismatch.json()["detail"]

    assert await _payment_count(env) == 0


# ------------------------------------------------------------------------------
# Role-based access
# ------------------------------------------------------------------------------


@pytest.mark.anyio
async def test_waiter_cannot_take_khqr_payments_but_cashier_can(env):
    denied_generate = await _generate(env, role="waiter")
    assert denied_generate.status_code == status.HTTP_403_FORBIDDEN

    data = await _generated_attempt(env, role="cashier")
    env["bakong"].mark_paid(data["md5"], amount=SESSION_TOTAL_USD, currency="USD")

    denied_settle = await _settle(env, data["attempt_id"], role="waiter")
    assert denied_settle.status_code == status.HTTP_403_FORBIDDEN
    assert env["bakong"].requests == []

    # Any member may read the attempt status.
    read = await env["client"].get(
        f"{env['base']}/khqr/attempts/{data['attempt_id']}",
        headers=_auth(env, "waiter"),
    )
    assert read.status_code == status.HTTP_200_OK

    allowed = await _settle(env, data["attempt_id"], role="cashier")
    assert allowed.status_code == status.HTTP_201_CREATED
