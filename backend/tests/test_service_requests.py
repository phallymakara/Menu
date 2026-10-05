"""Guest service requests (call staff, water, bill, ...) and the staff service hub."""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest
from fastapi import WebSocket, status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.core.ws_manager import ws_manager
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.audit_log import AuditLog
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import (
    MembershipStatus,
    ServiceRequestStatus,
    StaffRole,
    TableSessionStatus,
    TableStatus,
    UserStatus,
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.table_session import TableSession
from app.models.user import User
from app.services import service_request_service
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
PUBLIC_URL = "/api/v1/public/tables/service-requests"
TOKEN_HEADER = "X-Table-Session-Token"


@pytest.fixture
def anyio_backend():
    return "asyncio"


class RecordingWebSocket:
    """Stands in for a client socket and records every message the hub sends it."""

    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def accept(self) -> None:
        """Accepts the connection; nothing to do for a fake socket."""

    async def send_text(self, text: str) -> None:
        """Records a broadcast message."""
        self.messages.append(json.loads(text))

    def events(self) -> list[str]:
        """Returns the event names received, in order."""
        return [message["event"] for message in self.messages]


@asynccontextmanager
async def _listening(room: str) -> AsyncIterator[RecordingWebSocket]:
    """Joins a recording socket to a hub room for the duration of the block."""
    socket = RecordingWebSocket()
    websocket = cast(WebSocket, socket)
    await ws_manager.connect(websocket, room)
    try:
        yield socket
    finally:
        ws_manager.disconnect(websocket, room)


async def _open_table(
    session: AsyncSession,
    org: Organization,
    biz: Business,
    branch: Branch,
    table_number: str,
    session_status: TableSessionStatus = TableSessionStatus.ACTIVE,
) -> tuple[RestaurantTable, TableSession]:
    """Creates a table with a dining session in the given status."""
    table = RestaurantTable(
        organization_id=org.id,
        business_id=biz.id,
        branch_id=branch.id,
        table_number=table_number,
        status=TableStatus.OCCUPIED,
    )
    session.add(table)
    await session.flush()
    table_session = TableSession(
        organization_id=org.id,
        business_id=biz.id,
        branch_id=branch.id,
        table_id=table.id,
        session_code=f"S-{uuid4().hex[:6].upper()}",
        status=session_status,
    )
    session.add(table_session)
    await session.commit()
    return table, table_session


async def _add_member(
    session: AsyncSession,
    org: Organization,
    role: StaffRole,
    branch_id: Any,
    email: str,
) -> User:
    """Adds an active, non-owner staff member to an organization."""
    user = User(
        email=email,
        password_hash=hash_password("staff_password123"),
        full_name=f"{role.value.title()} Staff",
        status=UserStatus.ACTIVE,
        is_verified=True,
    )
    session.add(user)
    await session.flush()
    session.add(
        OrganizationMembership(
            organization_id=org.id,
            user_id=user.id,
            branch_id=branch_id,
            role=role,
            status=MembershipStatus.ACTIVE,
            is_owner=False,
        )
    )
    await session.commit()
    return user


def _bearer(user: User) -> dict[str, str]:
    """Builds a staff Authorization header."""
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _guest(table_session: TableSession) -> dict[str, str]:
    """Builds the guest session-token header."""
    assert table_session.session_token is not None
    return {TOKEN_HEADER: table_session.session_token}


def _table_params(table: RestaurantTable) -> dict[str, str]:
    """Query parameters that identify the guest's table."""
    return {"branch_id": str(table.branch_id), "table_id": str(table.id)}


def _staff_url(biz: Business, branch: Branch, suffix: str = "") -> str:
    """URL of the branch's staff service request endpoints."""
    return f"/api/v1/businesses/{biz.id}/branches/{branch.id}/service-requests{suffix}"


@pytest.fixture
async def hub():
    """One tenant with a branch, a table, and an active guest session, plus a client."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, branch = await setup_test_tenant(
            session, org_name="Service Hub Org", email="hub-owner@example.com"
        )
        table, table_session = await _open_table(session, org, biz, branch, "T-01")

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                yield SimpleNamespace(
                    client=client,
                    session=session,
                    owner=owner,
                    org=org,
                    biz=biz,
                    branch=branch,
                    table=table,
                    table_session=table_session,
                )
        finally:
            app.dependency_overrides.clear()

    await engine.dispose()


async def _create(hub: SimpleNamespace, request_type: str, note: str | None = None):
    """Raises a request as the fixture's guest."""
    body: dict[str, Any] = {"request_type": request_type}
    if note is not None:
        body["note"] = note
    return await hub.client.post(
        PUBLIC_URL,
        params=_table_params(hub.table),
        headers=_guest(hub.table_session),
        json=body,
    )


# ==============================================================================
# Guest side
# ==============================================================================


@pytest.mark.anyio
async def test_guest_creates_request_with_valid_session_token(hub):
    """A guest with a live session token raises an open request; the note is trimmed."""
    resp = await _create(hub, "water", note="  Two glasses, less ice  ")

    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["request_type"] == "water"
    assert data["status"] == "open"
    assert data["note"] == "Two glasses, less ice"
    assert data["table_number"] == "T-01"
    assert data["acknowledged_at"] is None
    assert "acknowledged_by_name" not in data

    stored = (await hub.session.execute(select(ServiceRequest))).scalar_one()
    assert stored.table_session_id == hub.table_session.id
    assert stored.organization_id == hub.org.id
    assert stored.branch_id == hub.branch.id


@pytest.mark.anyio
async def test_guest_request_rejected_with_invalid_token(hub):
    """A wrong, missing, or other table's token is rejected with 401."""
    other_table, other_session = await _open_table(
        hub.session, hub.org, hub.biz, hub.branch, "T-02"
    )
    body = {"request_type": "water"}

    wrong = await hub.client.post(
        PUBLIC_URL,
        params=_table_params(hub.table),
        headers={TOKEN_HEADER: "not-a-real-token"},
        json=body,
    )
    missing = await hub.client.post(
        PUBLIC_URL, params=_table_params(hub.table), json=body
    )
    # A real token, but for a different table than the one in the query.
    cross_table = await hub.client.post(
        PUBLIC_URL,
        params=_table_params(hub.table),
        headers=_guest(other_session),
        json=body,
    )
    listing = await hub.client.get(
        PUBLIC_URL,
        params=_table_params(other_table),
        headers={TOKEN_HEADER: "not-a-real-token"},
    )

    for resp in (wrong, missing, cross_table, listing):
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    assert wrong.json()["detail"] == "Invalid or expired table session."
    assert (await hub.session.execute(select(ServiceRequest))).first() is None


@pytest.mark.anyio
async def test_guest_request_rejected_on_closed_session(hub):
    """A token of a completed session can no longer raise or list requests."""
    hub.table_session.status = TableSessionStatus.COMPLETED
    await hub.session.commit()

    created = await _create(hub, "call_staff")
    listed = await hub.client.get(
        PUBLIC_URL,
        params=_table_params(hub.table),
        headers=_guest(hub.table_session),
    )

    assert created.status_code == status.HTTP_401_UNAUTHORIZED
    assert listed.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.anyio
async def test_bill_requested_session_can_still_raise_requests(hub):
    """Asking for the bill does not stop the guest from calling staff."""
    hub.table_session.status = TableSessionStatus.BILL_REQUESTED
    await hub.session.commit()

    resp = await _create(hub, "call_staff")

    assert resp.status_code == status.HTTP_201_CREATED


@pytest.mark.anyio
async def test_duplicate_open_request_of_same_type_is_rejected(hub):
    """One open request per type and session; other types are still allowed."""
    first = await _create(hub, "water")
    duplicate = await _create(hub, "water", note="Please hurry")
    other_type = await _create(hub, "cleaning")

    assert first.status_code == status.HTTP_201_CREATED
    assert duplicate.status_code == status.HTTP_409_CONFLICT
    assert "already have an open request" in duplicate.json()["detail"]
    assert other_type.status_code == status.HTTP_201_CREATED


@pytest.mark.anyio
async def test_database_rejects_concurrent_duplicate_open_request(hub, monkeypatch):
    """If two submissions pass the pre-check together, the unique index stops one."""
    assert (await _create(hub, "bill")).status_code == status.HTTP_201_CREATED

    real_find = service_request_service._find_open_request_id
    calls = {"count": 0}

    async def miss_first_lookup(*args: Any, **kwargs: Any):
        # The first lookup models the racing request that has not seen the insert yet.
        calls["count"] += 1
        if calls["count"] == 1:
            return None
        return await real_find(*args, **kwargs)

    monkeypatch.setattr(
        service_request_service, "_find_open_request_id", miss_first_lookup
    )
    resp = await _create(hub, "bill")

    assert resp.status_code == status.HTTP_409_CONFLICT
    open_bills = (
        await hub.session.execute(
            select(ServiceRequest).where(
                ServiceRequest.status == ServiceRequestStatus.OPEN
            )
        )
    ).all()
    assert len(open_bills) == 1


@pytest.mark.anyio
async def test_note_is_capped_and_required_for_custom_requests(hub):
    """Notes are capped at 200 characters; a custom request needs a note."""
    too_long = await _create(hub, "water", note="x" * 201)
    custom_without_note = await _create(hub, "custom", note="   ")
    custom_with_note = await _create(hub, "custom", note="Extra chopsticks")
    unknown_type = await _create(hub, "massage")

    assert too_long.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert custom_without_note.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert custom_with_note.status_code == status.HTTP_201_CREATED
    assert unknown_type.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.anyio
async def test_guest_lists_only_their_own_session_requests(hub):
    """Guests see their own session's requests, never another table's."""
    _, other_session = await _open_table(
        hub.session, hub.org, hub.biz, hub.branch, "T-02"
    )
    await _create(hub, "water")
    await _create(hub, "bill")
    other = await hub.client.post(
        PUBLIC_URL,
        params={
            "branch_id": str(hub.branch.id),
            "table_id": str(other_session.table_id),
        },
        headers=_guest(other_session),
        json={"request_type": "cleaning"},
    )
    assert other.status_code == status.HTTP_201_CREATED

    resp = await hub.client.get(
        PUBLIC_URL,
        params=_table_params(hub.table),
        headers=_guest(hub.table_session),
    )

    assert resp.status_code == status.HTTP_200_OK
    assert sorted(item["request_type"] for item in resp.json()) == ["bill", "water"]


# ==============================================================================
# Staff side
# ==============================================================================


@pytest.mark.anyio
async def test_staff_list_acknowledge_and_resolve(hub):
    """Staff see open requests, take one, then resolve it; each step is audited."""
    water_id = (await _create(hub, "water", note="No ice")).json()["id"]
    await _create(hub, "call_staff")
    staff = _bearer(hub.owner)

    listed = await hub.client.get(_staff_url(hub.biz, hub.branch), headers=staff)
    assert listed.status_code == status.HTTP_200_OK
    rows = {row["id"]: row for row in listed.json()}
    assert len(rows) == 2
    assert rows[water_id]["table_number"] == "T-01"
    assert rows[water_id]["note"] == "No ice"
    assert rows[water_id]["status"] == "open"

    ack = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{water_id}/acknowledge"), headers=staff
    )
    assert ack.status_code == status.HTTP_200_OK
    assert ack.json()["status"] == "acknowledged"
    assert ack.json()["acknowledged_by_user_id"] == str(hub.owner.id)
    assert ack.json()["acknowledged_by_name"] == "Test Owner"
    assert ack.json()["acknowledged_at"] is not None

    ack_again = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{water_id}/acknowledge"), headers=staff
    )
    assert ack_again.status_code == status.HTTP_409_CONFLICT

    resolved = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{water_id}/resolve"), headers=staff
    )
    assert resolved.status_code == status.HTTP_200_OK
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_by_name"] == "Test Owner"

    resolve_again = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{water_id}/resolve"), headers=staff
    )
    assert resolve_again.status_code == status.HTTP_409_CONFLICT

    # The default queue only holds requests still waiting on staff.
    active = await hub.client.get(_staff_url(hub.biz, hub.branch), headers=staff)
    assert [row["request_type"] for row in active.json()] == ["call_staff"]
    history = await hub.client.get(
        _staff_url(hub.biz, hub.branch),
        headers=staff,
        params={"status": ["resolved"]},
    )
    assert [row["id"] for row in history.json()] == [water_id]

    # The guest sees the new status too, and may ask for water again.
    guest_view = await hub.client.get(
        PUBLIC_URL,
        params=_table_params(hub.table),
        headers=_guest(hub.table_session),
    )
    statuses = {item["id"]: item["status"] for item in guest_view.json()}
    assert statuses[water_id] == "resolved"
    assert (await _create(hub, "water")).status_code == status.HTTP_201_CREATED

    actions = (
        (
            await hub.session.execute(
                select(AuditLog.action).where(
                    AuditLog.resource_type == "service_request"
                )
            )
        )
        .scalars()
        .all()
    )
    assert sorted(actions) == [
        "SERVICE_REQUEST_ACKNOWLEDGED",
        "SERVICE_REQUEST_RESOLVED",
    ]


@pytest.mark.anyio
async def test_staff_can_resolve_an_open_request_directly(hub):
    """Resolving without acknowledging first leaves the acknowledgement empty."""
    request_id = (await _create(hub, "cleaning")).json()["id"]

    resp = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{request_id}/resolve"),
        headers=_bearer(hub.owner),
    )

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["status"] == "resolved"
    assert resp.json()["acknowledged_at"] is None


@pytest.mark.anyio
async def test_cross_tenant_staff_access_returns_404(hub):
    """An owner of another organization cannot see or touch this branch's requests."""
    request_id = (await _create(hub, "water")).json()["id"]
    outsider, _, outsider_biz, _ = await setup_test_tenant(
        hub.session, org_name="Outsider Org", email="outsider@example.com"
    )
    attacker = _bearer(outsider)

    listed = await hub.client.get(_staff_url(hub.biz, hub.branch), headers=attacker)
    ack = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{request_id}/acknowledge"),
        headers=attacker,
    )
    resolve = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{request_id}/resolve"),
        headers=attacker,
    )
    # Pairing the attacker's own business with the victim's branch fails as well.
    mixed = await hub.client.get(_staff_url(outsider_biz, hub.branch), headers=attacker)

    for resp in (listed, ack, resolve, mixed):
        assert resp.status_code == status.HTTP_404_NOT_FOUND
    stored = (await hub.session.execute(select(ServiceRequest))).scalar_one()
    assert stored.status == ServiceRequestStatus.OPEN


@pytest.mark.anyio
async def test_unknown_request_id_returns_404(hub):
    """A request ID that is not in this branch is not found."""
    resp = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{uuid4()}/acknowledge"),
        headers=_bearer(hub.owner),
    )

    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.anyio
async def test_branch_locked_staff_only_work_their_own_branch(hub):
    """Branch staff use their own branch only; back-of-house roles are refused."""
    second_branch = Branch(
        organization_id=hub.org.id,
        business_id=hub.biz.id,
        name_en="Second Branch",
        code="B-02",
        is_active=True,
    )
    hub.session.add(second_branch)
    await hub.session.commit()
    waiter = await _add_member(
        hub.session, hub.org, StaffRole.WAITER, hub.branch.id, "waiter@example.com"
    )
    cook = await _add_member(
        hub.session, hub.org, StaffRole.KITCHEN, hub.branch.id, "cook@example.com"
    )
    request_id = (await _create(hub, "water")).json()["id"]

    own = await hub.client.get(_staff_url(hub.biz, hub.branch), headers=_bearer(waiter))
    other = await hub.client.get(
        _staff_url(hub.biz, second_branch), headers=_bearer(waiter)
    )
    cook_list = await hub.client.get(
        _staff_url(hub.biz, hub.branch), headers=_bearer(cook)
    )
    cook_ack = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{request_id}/acknowledge"),
        headers=_bearer(cook),
    )
    waiter_ack = await hub.client.post(
        _staff_url(hub.biz, hub.branch, f"/{request_id}/acknowledge"),
        headers=_bearer(waiter),
    )

    assert own.status_code == status.HTTP_200_OK
    assert other.status_code == status.HTTP_403_FORBIDDEN
    assert cook_list.status_code == status.HTTP_403_FORBIDDEN
    assert cook_ack.status_code == status.HTTP_403_FORBIDDEN
    assert waiter_ack.status_code == status.HTTP_200_OK
    assert waiter_ack.json()["acknowledged_by_name"] == "Waiter Staff"


# ==============================================================================
# Real-time broadcasts
# ==============================================================================


@pytest.mark.anyio
async def test_request_changes_broadcast_to_pos_and_guest_session(hub):
    """Create and status changes reach the branch POS room and the guest's room."""
    async with (
        _listening(f"branch:{hub.branch.id}:pos") as pos,
        _listening(f"session:{hub.table_session.id}") as guest,
    ):
        request_id = (await _create(hub, "water")).json()["id"]
        await hub.client.post(
            _staff_url(hub.biz, hub.branch, f"/{request_id}/acknowledge"),
            headers=_bearer(hub.owner),
        )

    expected = ["service_request.created", "service_request.updated"]
    assert pos.events() == expected
    assert guest.events() == expected
    update = guest.messages[1]
    assert update["branch_id"] == str(hub.branch.id)
    assert update["data"]["id"] == request_id
    assert update["data"]["status"] == "acknowledged"
    assert update["data"]["table_session_id"] == str(hub.table_session.id)
    # The guest room gets no staff identities.
    assert "acknowledged_by_user_id" not in update["data"]
    assert "acknowledged_by_name" not in update["data"]


@pytest.mark.anyio
async def test_request_bill_broadcasts_bill_requested_to_pos(hub):
    """The guest request-bill flow notifies the POS room once, on the transition."""
    params = {
        "branch_id": str(hub.branch.id),
        "table_id": str(hub.table.id),
        "token": hub.table.qr_code_token,
    }
    async with _listening(f"branch:{hub.branch.id}:pos") as pos:
        first = await hub.client.post(
            "/api/v1/public/tables/sessions/request-bill", params=params
        )
        repeat = await hub.client.post(
            "/api/v1/public/tables/sessions/request-bill", params=params
        )

    assert first.status_code == status.HTTP_200_OK
    assert first.json()["status"] == "bill_requested"
    assert repeat.status_code == status.HTTP_200_OK
    assert pos.events() == ["table_session.bill_requested"]
    data = pos.messages[0]["data"]
    assert data["table_session_id"] == str(hub.table_session.id)
    assert data["table_id"] == str(hub.table.id)
    assert data["table_number"] == "T-01"
    assert data["bill_requested_at"] is not None
