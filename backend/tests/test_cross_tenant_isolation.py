"""
Regression tests: one tenant must not read or change another tenant's data.

Covers issue #3 (orders and kitchen stations) and the cross-tenant paths fixed
with it: staff order items, inventory, static KHQR, and combos. Every test seeds
a victim organization (A) and an attacker organization (B). B's owner replays
A's IDs and must get 404, and A's data is checked afterwards to prove nothing
changed.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from decimal import Decimal

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.branch import Branch
from app.models.business import Business
from app.models.category import Category
from app.models.inventory import BranchStock
from app.models.menu_item import MenuItem
from app.models.user import User
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@dataclass
class TwoTenants:
    """Seeded victim (A) and attacker (B) tenants plus an HTTP client."""

    client: AsyncClient
    session: AsyncSession
    headers_a: dict[str, str]
    headers_b: dict[str, str]
    biz_a: Business
    branch_a: Branch
    category_a: Category
    item_a: MenuItem
    biz_b: Business
    branch_b: Branch
    item_b: MenuItem


def _auth(user: User) -> dict[str, str]:
    """Builds a bearer header for a user."""
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
async def two_tenants() -> AsyncIterator[TwoTenants]:
    """Seeds two organizations, each with a business, branch, category, and dish."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner_a, org_a, biz_a, branch_a = await setup_test_tenant(
            session, org_name="Victim Org", email="victim@example.com"
        )
        owner_b, org_b, biz_b, branch_b = await setup_test_tenant(
            session, org_name="Attacker Org", email="attacker@example.com"
        )
        biz_a.bakong_account_id = "victim_merchant@bkng"

        category_a = Category(
            organization_id=org_a.id,
            business_id=biz_a.id,
            name_en="Victim Mains",
            display_order=1,
            is_active=True,
        )
        category_b = Category(
            organization_id=org_b.id,
            business_id=biz_b.id,
            name_en="Attacker Mains",
            display_order=1,
            is_active=True,
        )
        session.add_all([category_a, category_b])
        await session.flush()

        item_a = MenuItem(
            organization_id=org_a.id,
            business_id=biz_a.id,
            category_id=category_a.id,
            name_en="Fish Amok",
            sku="AMOK-01",
            base_price=Decimal("6.50"),
            is_active=True,
        )
        item_b = MenuItem(
            organization_id=org_b.id,
            business_id=biz_b.id,
            category_id=category_b.id,
            name_en="Beef Lok Lak",
            sku="LOK-01",
            base_price=Decimal("5.00"),
            is_active=True,
        )
        session.add_all([item_a, item_b])
        await session.commit()

        async def _override_db():
            yield session

        app.dependency_overrides[get_db_session] = _override_db
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                yield TwoTenants(
                    client=client,
                    session=session,
                    headers_a=_auth(owner_a),
                    headers_b=_auth(owner_b),
                    biz_a=biz_a,
                    branch_a=branch_a,
                    category_a=category_a,
                    item_a=item_a,
                    biz_b=biz_b,
                    branch_b=branch_b,
                    item_b=item_b,
                )
        finally:
            app.dependency_overrides.clear()

    await engine.dispose()


@pytest.mark.anyio
async def test_orders_are_isolated_between_tenants(two_tenants: TwoTenants):
    """Org B's owner gets 404 on org A's orders: list, get, bill, and create."""
    t = two_tenants
    orders_a = f"/api/v1/businesses/{t.biz_a.id}/branches/{t.branch_a.id}/orders"
    orders_b = f"/api/v1/businesses/{t.biz_b.id}/branches/{t.branch_b.id}/orders"
    takeaway = {
        "order_type": "takeaway",
        "items": [{"menu_item_id": str(t.item_a.id), "quantity": 1}],
    }

    created = await t.client.post(orders_a, headers=t.headers_a, json=takeaway)
    assert created.status_code == status.HTTP_201_CREATED
    order_id = created.json()["id"]

    # Org A's business and branch IDs in the path.
    listed = await t.client.get(orders_a, headers=t.headers_b)
    assert listed.status_code == status.HTTP_404_NOT_FOUND
    read = await t.client.get(f"{orders_a}/{order_id}", headers=t.headers_b)
    assert read.status_code == status.HTTP_404_NOT_FOUND
    bill = await t.client.get(f"{orders_a}/{order_id}/bill", headers=t.headers_b)
    assert bill.status_code == status.HTTP_404_NOT_FOUND
    placed = await t.client.post(orders_a, headers=t.headers_b, json=takeaway)
    assert placed.status_code == status.HTTP_404_NOT_FOUND

    # Org B's own path with org A's order ID.
    read_own_path = await t.client.get(f"{orders_b}/{order_id}", headers=t.headers_b)
    assert read_own_path.status_code == status.HTTP_404_NOT_FOUND
    bill_own_path = await t.client.get(
        f"{orders_b}/{order_id}/bill", headers=t.headers_b
    )
    assert bill_own_path.status_code == status.HTTP_404_NOT_FOUND

    # Org A still sees exactly its own order.
    own = await t.client.get(orders_a, headers=t.headers_a)
    assert own.status_code == status.HTTP_200_OK
    assert [o["id"] for o in own.json()] == [order_id]
    own_read = await t.client.get(f"{orders_a}/{order_id}", headers=t.headers_a)
    assert own_read.status_code == status.HTTP_200_OK
    own_bill = await t.client.get(f"{orders_a}/{order_id}/bill", headers=t.headers_a)
    assert own_bill.status_code == status.HTTP_200_OK


@pytest.mark.anyio
async def test_staff_order_rejects_another_tenants_menu_item(two_tenants: TwoTenants):
    """A staff order on org B's own branch cannot include org A's dish."""
    t = two_tenants
    orders_b = f"/api/v1/businesses/{t.biz_b.id}/branches/{t.branch_b.id}/orders"

    res = await t.client.post(
        orders_b,
        headers=t.headers_b,
        json={
            "order_type": "takeaway",
            "items": [{"menu_item_id": str(t.item_a.id), "quantity": 1}],
        },
    )
    assert res.status_code == status.HTTP_404_NOT_FOUND

    own = await t.client.post(
        orders_b,
        headers=t.headers_b,
        json={
            "order_type": "takeaway",
            "items": [{"menu_item_id": str(t.item_b.id), "quantity": 1}],
        },
    )
    assert own.status_code == status.HTTP_201_CREATED


@pytest.mark.anyio
async def test_kitchen_stations_are_isolated_between_tenants(two_tenants: TwoTenants):
    """Org B's owner gets 404 creating, listing, updating, deleting, or assigning
    org A's kitchen stations, and org A's dishes keep their routing."""
    t = two_tenants
    stations_a = (
        f"/api/v1/businesses/{t.biz_a.id}/branches/{t.branch_a.id}/kitchen-stations"
    )

    created = await t.client.post(
        stations_a,
        headers=t.headers_a,
        json={"name_en": "Grill", "code": "GRILL"},
    )
    assert created.status_code == status.HTTP_201_CREATED
    station_id = created.json()["id"]

    create_attack = await t.client.post(
        stations_a,
        headers=t.headers_b,
        json={"name_en": "Rogue", "code": "ROGUE"},
    )
    assert create_attack.status_code == status.HTTP_404_NOT_FOUND
    list_attack = await t.client.get(stations_a, headers=t.headers_b)
    assert list_attack.status_code == status.HTTP_404_NOT_FOUND
    update_attack = await t.client.put(
        f"{stations_a}/{station_id}",
        headers=t.headers_b,
        json={"name_en": "Hijacked"},
    )
    assert update_attack.status_code == status.HTTP_404_NOT_FOUND
    assign_attack = await t.client.post(
        f"{stations_a}/{station_id}/assignments",
        headers=t.headers_b,
        json={
            "category_ids": [str(t.category_a.id)],
            "menu_item_ids": [str(t.item_a.id)],
        },
    )
    assert assign_attack.status_code == status.HTTP_404_NOT_FOUND
    delete_attack = await t.client.delete(
        f"{stations_a}/{station_id}", headers=t.headers_b
    )
    assert delete_attack.status_code == status.HTTP_404_NOT_FOUND

    # Org A's station is untouched and its dishes were not re-routed.
    own = await t.client.get(stations_a, headers=t.headers_a)
    assert own.status_code == status.HTTP_200_OK
    assert [(s["id"], s["name_en"]) for s in own.json()] == [(station_id, "Grill")]
    await t.session.refresh(t.category_a)
    await t.session.refresh(t.item_a)
    assert t.category_a.kitchen_station_id is None
    assert t.item_a.kitchen_station_id is None


@pytest.mark.anyio
async def test_station_assignment_only_touches_own_tenant_rows(
    two_tenants: TwoTenants,
):
    """Assigning org A's dish IDs to org B's own station leaves org A's rows alone."""
    t = two_tenants
    stations_b = (
        f"/api/v1/businesses/{t.biz_b.id}/branches/{t.branch_b.id}/kitchen-stations"
    )
    created = await t.client.post(
        stations_b, headers=t.headers_b, json={"name_en": "Bar", "code": "BAR"}
    )
    assert created.status_code == status.HTTP_201_CREATED
    station_id = created.json()["id"]

    res = await t.client.post(
        f"{stations_b}/{station_id}/assignments",
        headers=t.headers_b,
        json={
            "category_ids": [str(t.category_a.id)],
            "menu_item_ids": [str(t.item_a.id), str(t.item_b.id)],
        },
    )
    assert res.status_code == status.HTTP_200_OK

    await t.session.refresh(t.category_a)
    await t.session.refresh(t.item_a)
    await t.session.refresh(t.item_b)
    assert t.category_a.kitchen_station_id is None
    assert t.item_a.kitchen_station_id is None
    assert str(t.item_b.kitchen_station_id) == station_id


@pytest.mark.anyio
async def test_inventory_is_isolated_between_tenants(two_tenants: TwoTenants):
    """Org B's owner gets 404 adjusting org A's stock or creating, approving,
    dispatching, or receiving transfers with org A's branches and items."""
    t = two_tenants
    second_branch_a = Branch(
        organization_id=t.biz_a.organization_id,
        business_id=t.biz_a.id,
        name_en="Victim Riverside",
        code="B-02",
        is_active=True,
    )
    t.session.add(second_branch_a)
    await t.session.commit()

    inventory_a = f"/api/v1/businesses/{t.biz_a.id}/inventory"
    inventory_b = f"/api/v1/businesses/{t.biz_b.id}/inventory"

    item_res = await t.client.post(
        f"{inventory_a}/items",
        headers=t.headers_a,
        json={"name_en": "Palm Sugar", "unit_of_measure": "kg"},
    )
    assert item_res.status_code == status.HTTP_201_CREATED
    inv_item_a = item_res.json()["id"]
    restock = await t.client.post(
        f"{inventory_a}/branches/{t.branch_a.id}/stock/adjust",
        headers=t.headers_a,
        json={"inventory_item_id": inv_item_a, "quantity_change": "10.00"},
    )
    assert restock.status_code == status.HTTP_200_OK
    transfer_res = await t.client.post(
        f"{inventory_a}/transfers",
        headers=t.headers_a,
        json={
            "source_branch_id": str(t.branch_a.id),
            "destination_branch_id": str(second_branch_a.id),
            "items": [{"inventory_item_id": inv_item_a, "requested_quantity": "4.00"}],
        },
    )
    assert transfer_res.status_code == status.HTTP_201_CREATED
    transfer_a = transfer_res.json()["id"]

    # Stock adjust: org A's path, and org B's own path with org A's item.
    adjust_attack = await t.client.post(
        f"{inventory_a}/branches/{t.branch_a.id}/stock/adjust",
        headers=t.headers_b,
        json={"inventory_item_id": inv_item_a, "quantity_change": "-10.00"},
    )
    assert adjust_attack.status_code == status.HTTP_404_NOT_FOUND
    adjust_foreign_item = await t.client.post(
        f"{inventory_b}/branches/{t.branch_b.id}/stock/adjust",
        headers=t.headers_b,
        json={"inventory_item_id": inv_item_a, "quantity_change": "5.00"},
    )
    assert adjust_foreign_item.status_code == status.HTTP_404_NOT_FOUND
    adjust_foreign_branch = await t.client.post(
        f"{inventory_b}/branches/{t.branch_a.id}/stock/adjust",
        headers=t.headers_b,
        json={"inventory_item_id": inv_item_a, "quantity_change": "5.00"},
    )
    assert adjust_foreign_branch.status_code == status.HTTP_404_NOT_FOUND

    # Transfer creation: org A's business, org A's branches, or org A's item.
    for path, source, destination in (
        (inventory_a, t.branch_a.id, second_branch_a.id),
        (inventory_b, t.branch_a.id, second_branch_a.id),
        (inventory_b, t.branch_b.id, t.branch_a.id),
    ):
        create_attack = await t.client.post(
            f"{path}/transfers",
            headers=t.headers_b,
            json={
                "source_branch_id": str(source),
                "destination_branch_id": str(destination),
                "items": [
                    {"inventory_item_id": inv_item_a, "requested_quantity": "1.00"}
                ],
            },
        )
        assert create_attack.status_code == status.HTTP_404_NOT_FOUND

    second_branch_b = Branch(
        organization_id=t.biz_b.organization_id,
        business_id=t.biz_b.id,
        name_en="Attacker Riverside",
        code="B-02",
        is_active=True,
    )
    t.session.add(second_branch_b)
    await t.session.commit()
    foreign_item_transfer = await t.client.post(
        f"{inventory_b}/transfers",
        headers=t.headers_b,
        json={
            "source_branch_id": str(t.branch_b.id),
            "destination_branch_id": str(second_branch_b.id),
            "items": [{"inventory_item_id": inv_item_a, "requested_quantity": "1.00"}],
        },
    )
    assert foreign_item_transfer.status_code == status.HTTP_404_NOT_FOUND

    # Transfer lifecycle on org A's transfer, through both business paths.
    for path in (inventory_a, inventory_b):
        for action in ("approve", "dispatch", "receive"):
            res = await t.client.post(
                f"{path}/transfers/{transfer_a}/{action}", headers=t.headers_b
            )
            assert res.status_code == status.HTTP_404_NOT_FOUND

    # Inventory items: org A's business, or a link to org A's dish.
    item_attack = await t.client.post(
        f"{inventory_a}/items",
        headers=t.headers_b,
        json={"name_en": "Rogue Item"},
    )
    assert item_attack.status_code == status.HTTP_404_NOT_FOUND
    foreign_menu_link = await t.client.post(
        f"{inventory_b}/items",
        headers=t.headers_b,
        json={"name_en": "Linked Item", "menu_item_id": str(t.item_a.id)},
    )
    assert foreign_menu_link.status_code == status.HTTP_404_NOT_FOUND

    # Org A's stock and transfer are unchanged, and org B created no stock rows
    # for org A's item.
    stock = await t.client.get(
        f"{inventory_a}/branches/{t.branch_a.id}/stock", headers=t.headers_a
    )
    assert stock.status_code == status.HTTP_200_OK
    assert [Decimal(str(s["quantity"])) for s in stock.json()] == [Decimal("10.00")]
    transfers = await t.client.get(f"{inventory_a}/transfers", headers=t.headers_a)
    assert transfers.status_code == status.HTTP_200_OK
    assert [(tr["id"], tr["status"]) for tr in transfers.json()] == [
        (transfer_a, "requested")
    ]
    foreign_rows = await t.session.execute(
        select(func.count(BranchStock.id)).where(
            BranchStock.organization_id == t.biz_b.organization_id
        )
    )
    assert foreign_rows.scalar_one() == 0


@pytest.mark.anyio
async def test_static_khqr_is_isolated_between_tenants(two_tenants: TwoTenants):
    """Org B's owner cannot render org A's static merchant KHQR."""
    t = two_tenants
    static_a = f"/api/v1/businesses/{t.biz_a.id}/branches/{t.branch_a.id}/khqr/static"
    mixed = f"/api/v1/businesses/{t.biz_b.id}/branches/{t.branch_a.id}/khqr/static"

    attack = await t.client.get(static_a, headers=t.headers_b)
    assert attack.status_code == status.HTTP_404_NOT_FOUND
    assert "victim_merchant" not in attack.text
    mixed_attack = await t.client.get(mixed, headers=t.headers_b)
    assert mixed_attack.status_code == status.HTTP_404_NOT_FOUND

    own = await t.client.get(static_a, headers=t.headers_a)
    assert own.status_code == status.HTTP_200_OK
    assert own.json()["bakong_account_id"] == "victim_merchant@bkng"


@pytest.mark.anyio
async def test_combos_cannot_reference_another_tenants_catalog(
    two_tenants: TwoTenants,
):
    """Org B cannot build combos from org A's dishes or categories."""
    t = two_tenants
    combos_b = f"/api/v1/businesses/{t.biz_b.id}/combos"

    foreign_item = await t.client.post(
        combos_b,
        headers=t.headers_b,
        json={
            "name_en": "Stolen Set",
            "groups": [
                {"name_en": "Main", "items": [{"menu_item_id": str(t.item_a.id)}]}
            ],
        },
    )
    assert foreign_item.status_code == status.HTTP_404_NOT_FOUND
    foreign_category = await t.client.post(
        combos_b,
        headers=t.headers_b,
        json={"name_en": "Stolen Category Set", "category_id": str(t.category_a.id)},
    )
    assert foreign_category.status_code == status.HTTP_404_NOT_FOUND

    created = await t.client.post(
        combos_b,
        headers=t.headers_b,
        json={
            "name_en": "Lunch Set",
            "groups": [
                {"name_en": "Main", "items": [{"menu_item_id": str(t.item_b.id)}]}
            ],
        },
    )
    assert created.status_code == status.HTTP_201_CREATED
    combo_id = created.json()["id"]

    patch_attack = await t.client.patch(
        f"{combos_b}/{combo_id}",
        headers=t.headers_b,
        json={"category_id": str(t.category_a.id)},
    )
    assert patch_attack.status_code == status.HTTP_404_NOT_FOUND
    group_attack = await t.client.post(
        f"{combos_b}/{combo_id}/groups",
        headers=t.headers_b,
        json={"name_en": "Side", "items": [{"menu_item_id": str(t.item_a.id)}]},
    )
    assert group_attack.status_code == status.HTTP_404_NOT_FOUND

    combo = await t.client.get(f"{combos_b}/{combo_id}", headers=t.headers_b)
    assert combo.status_code == status.HTTP_200_OK
    assert combo.json()["category_id"] is None
    assert [g["name_en"] for g in combo.json()["groups"]] == ["Main"]
