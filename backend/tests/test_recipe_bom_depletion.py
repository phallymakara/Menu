"""Recipe (BOM) management, recipe stock depletion, void waste, and COGS analytics."""

from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

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
from app.models.enums import (
    MembershipStatus,
    OrderItemStatus,
    OrderStatus,
    StaffRole,
    StationType,
    StockAdjustmentReason,
    UnitOfMeasure,
    UserStatus,
)
from app.models.inventory import BranchStock, InventoryItem, StockAdjustmentLog
from app.models.item_variant import ItemVariant
from app.models.kitchen_station import KitchenStation
from app.models.menu_item import MenuItem
from app.models.order import Order, OrderItem
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from tests.test_staff_management import setup_test_tenant

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def bom_setup():
    """Seeds a tenant with a menu, variants, inventory and stock, plus a rival tenant."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with sessionmaker() as session:
        owner, org, biz, branch = await setup_test_tenant(
            session, org_name="BOM Org", email="owner@bom.example.com"
        )
        rival_owner, rival_org, rival_biz, _ = await setup_test_tenant(
            session, org_name="Rival Org", email="owner@rival.example.com"
        )

        def scoped(**kwargs: Any) -> dict[str, Any]:
            return {"id": uuid4(), "organization_id": org.id, **kwargs}

        branch_two = Branch(
            **scoped(business_id=biz.id, name_en="Riverside", code="B-02"),
            is_active=True,
        )
        station = KitchenStation(
            **scoped(business_id=biz.id, branch_id=branch.id),
            name_en="Coffee Bar",
            code="BAR",
            station_type=StationType.PREP_STATION,
            color_hex="#3B82F6",
            display_order=1,
            is_active=True,
        )
        latte = MenuItem(
            **scoped(business_id=biz.id),
            name_en="Iced Latte",
            base_price=Decimal("3.00"),
        )
        croissant = MenuItem(
            **scoped(business_id=biz.id),
            name_en="Butter Croissant",
            base_price=Decimal("2.00"),
        )
        water = MenuItem(
            **scoped(business_id=biz.id),
            name_en="Still Water",
            base_price=Decimal("1.00"),
        )
        small = ItemVariant(
            **scoped(business_id=biz.id, menu_item_id=latte.id),
            name_en="Small",
        )
        large = ItemVariant(
            **scoped(business_id=biz.id, menu_item_id=latte.id),
            name_en="Large",
        )

        def ingredient(name: str, unit: UnitOfMeasure, cost: str) -> InventoryItem:
            return InventoryItem(
                **scoped(business_id=biz.id),
                name_en=name,
                unit_of_measure=unit,
                cost_per_unit_usd=Decimal(cost),
                reorder_threshold=Decimal("10.00"),
                ideal_stock_quantity=Decimal("100.00"),
            )

        beans = ingredient("Coffee Beans", UnitOfMeasure.G, "0.0200")
        milk = ingredient("Fresh Milk", UnitOfMeasure.ML, "0.0030")
        cup = ingredient("Paper Cup", UnitOfMeasure.PIECE, "0.0500")
        butter = ingredient("Butter", UnitOfMeasure.G, "0.0100")
        syrup = ingredient("Sugar Syrup", UnitOfMeasure.ML, "0.0040")

        rival_dish = MenuItem(
            id=uuid4(),
            organization_id=rival_org.id,
            business_id=rival_biz.id,
            name_en="Rival Dish",
            base_price=Decimal("5.00"),
        )
        rival_flour = InventoryItem(
            id=uuid4(),
            organization_id=rival_org.id,
            business_id=rival_biz.id,
            name_en="Rival Flour",
            unit_of_measure=UnitOfMeasure.KG,
            cost_per_unit_usd=Decimal("1.0000"),
        )
        session.add_all(
            [
                branch_two,
                station,
                latte,
                croissant,
                water,
                small,
                large,
                beans,
                milk,
                cup,
                butter,
                syrup,
                rival_dish,
                rival_flour,
            ]
        )
        await session.flush()

        # Syrup deliberately has no stock row: depletion must create it.
        opening = {
            beans.id: "1000.00",
            milk.id: "2000.00",
            cup.id: "50.00",
            butter.id: "5.00",
        }
        for target_branch in (branch, branch_two):
            for inventory_item_id, quantity in opening.items():
                session.add(
                    BranchStock(
                        organization_id=org.id,
                        business_id=biz.id,
                        branch_id=target_branch.id,
                        inventory_item_id=inventory_item_id,
                        quantity=Decimal(quantity),
                        reorder_threshold=Decimal("10.00"),
                    )
                )
        await session.commit()

    yield {
        "sessionmaker": sessionmaker,
        "token": create_access_token(owner.id),
        "rival_token": create_access_token(rival_owner.id),
        "owner_id": owner.id,
        "org_id": org.id,
        "business_id": biz.id,
        "branch_id": branch.id,
        "branch_two_id": branch_two.id,
        "station_id": station.id,
        "latte_id": latte.id,
        "croissant_id": croissant.id,
        "water_id": water.id,
        "small_id": small.id,
        "large_id": large.id,
        "beans_id": beans.id,
        "milk_id": milk.id,
        "cup_id": cup.id,
        "butter_id": butter.id,
        "syrup_id": syrup.id,
        "rival_org_id": rival_org.id,
        "rival_business_id": rival_biz.id,
        "rival_dish_id": rival_dish.id,
        "rival_flour_id": rival_flour.id,
    }

    await engine.dispose()


@asynccontextmanager
async def _api(setup: dict[str, Any]) -> AsyncIterator[AsyncClient]:
    """Yields an API client whose requests each use a fresh session."""

    async def _override_db():
        async with setup["sessionmaker"]() as session:
            yield session

    app.dependency_overrides[get_db_session] = _override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def _auth(setup: dict[str, Any], token_key: str = "token") -> dict[str, str]:
    return {"Authorization": f"Bearer {setup[token_key]}"}


def _recipe_url(business_id: UUID, item_id: UUID) -> str:
    return f"/api/v1/businesses/{business_id}/items/{item_id}/recipe"


def _line(
    inventory_item_id: UUID, quantity: str, variant_id: UUID | None = None
) -> dict[str, Any]:
    return {
        "inventory_item_id": str(inventory_item_id),
        "variant_id": str(variant_id) if variant_id else None,
        "quantity": quantity,
    }


async def _put_recipe(
    client: AsyncClient,
    setup: dict[str, Any],
    item_id: UUID,
    lines: list[dict[str, Any]],
) -> None:
    res = await client.put(
        _recipe_url(setup["business_id"], item_id),
        headers=_auth(setup),
        json={"lines": lines},
    )
    assert res.status_code == status.HTTP_200_OK, res.text


async def _create_order(
    setup: dict[str, Any],
    lines: Sequence[tuple[UUID, UUID | None, int]],
    *,
    branch_key: str = "branch_id",
    subtotal: str = "0.00",
) -> tuple[UUID, list[UUID]]:
    """Creates a confirmed order of pending items routed to the coffee bar."""
    async with setup["sessionmaker"]() as session:
        order = Order(
            organization_id=setup["org_id"],
            business_id=setup["business_id"],
            branch_id=setup[branch_key],
            order_number=f"#T-{uuid4().hex[:6]}",
            status=OrderStatus.CONFIRMED,
            subtotal_usd=Decimal(subtotal),
            total_amount_usd=Decimal(subtotal),
        )
        items = [
            OrderItem(
                id=uuid4(),
                menu_item_id=menu_item_id,
                item_variant_id=variant_id,
                item_name_en="Test Item",
                base_unit_price=Decimal("1.00"),
                unit_price=Decimal("1.00"),
                quantity=quantity,
                subtotal_price=Decimal(subtotal) / len(lines),
                status=OrderItemStatus.PENDING,
                kitchen_station_id=(
                    setup["station_id"] if branch_key == "branch_id" else None
                ),
            )
            for menu_item_id, variant_id, quantity in lines
        ]
        order.items = items
        session.add(order)
        await session.commit()
        return order.id, [item.id for item in items]


async def _bump(
    client: AsyncClient,
    setup: dict[str, Any],
    item_id: UUID,
    target: str,
    branch_key: str = "branch_id",
) -> None:
    res = await client.post(
        f"/api/v1/businesses/{setup['business_id']}/branches/{setup[branch_key]}"
        f"/kds/items/{item_id}/bump",
        headers=_auth(setup),
        json={"target_status": target},
    )
    assert res.status_code == status.HTTP_200_OK, res.text


async def _stock(
    setup: dict[str, Any], inventory_key: str, branch_key: str = "branch_id"
) -> BranchStock | None:
    async with setup["sessionmaker"]() as session:
        res = await session.execute(
            select(BranchStock).where(
                BranchStock.branch_id == setup[branch_key],
                BranchStock.inventory_item_id == setup[inventory_key],
            )
        )
        return res.scalar_one_or_none()


async def _quantity(
    setup: dict[str, Any], inventory_key: str, branch_key: str = "branch_id"
) -> Decimal:
    stock = await _stock(setup, inventory_key, branch_key)
    assert stock is not None, f"no branch stock row for {inventory_key}"
    return stock.quantity


async def _logs(
    setup: dict[str, Any], order_item_ids: Sequence[UUID]
) -> list[StockAdjustmentLog]:
    async with setup["sessionmaker"]() as session:
        res = await session.execute(
            select(StockAdjustmentLog)
            .where(StockAdjustmentLog.order_item_id.in_(order_item_ids))
            .order_by(StockAdjustmentLog.previous_quantity.desc())
        )
        return list(res.scalars().all())


async def _order_item(setup: dict[str, Any], item_id: UUID) -> OrderItem:
    async with setup["sessionmaker"]() as session:
        item = await session.get(OrderItem, item_id)
        assert item is not None
        return item


async def _add_member(setup: dict[str, Any], role: StaffRole) -> dict[str, Any]:
    """Adds an active member with ``role`` at the main branch; returns id and headers."""
    async with setup["sessionmaker"]() as session:
        user = User(
            email=f"{role.value}@bom.example.com",
            password_hash="not-used",
            full_name=f"{role.value} member",
            status=UserStatus.ACTIVE,
            is_verified=True,
        )
        session.add(user)
        await session.flush()
        session.add(
            OrganizationMembership(
                organization_id=setup["org_id"],
                user_id=user.id,
                branch_id=setup["branch_id"],
                role=role,
                status=MembershipStatus.ACTIVE,
                is_owner=False,
            )
        )
        await session.commit()
        return {
            "user_id": user.id,
            "headers": {"Authorization": f"Bearer {create_access_token(user.id)}"},
        }


# ==============================================================================
# Recipe management
# ==============================================================================


@pytest.mark.anyio
async def test_recipe_replace_and_get_round_trip(bom_setup):
    """PUT replaces the whole recipe atomically; GET returns the stored lines."""
    s = bom_setup
    url = _recipe_url(s["business_id"], s["latte_id"])
    async with _api(s) as client:
        empty = await client.get(url, headers=_auth(s))
        assert empty.status_code == status.HTTP_200_OK
        assert empty.json()["lines"] == []

        put = await client.put(
            url,
            headers=_auth(s),
            json={
                "lines": [
                    _line(s["milk_id"], "250", s["large_id"]),
                    _line(s["beans_id"], "18"),
                    _line(s["milk_id"], "150"),
                    _line(s["cup_id"], "1"),
                ]
            },
        )
        assert put.status_code == status.HTTP_200_OK, put.text
        body = put.json()
        assert body["menu_item_id"] == str(s["latte_id"])
        assert body["business_id"] == str(s["business_id"])
        # All-variants lines come first, ordered by ingredient name.
        summary = [
            (
                line["inventory_item_name_en"],
                line["variant_name_en"],
                Decimal(line["quantity"]),
                line["unit_of_measure"],
            )
            for line in body["lines"]
        ]
        assert summary == [
            ("Coffee Beans", None, Decimal("18"), "g"),
            ("Fresh Milk", None, Decimal("150"), "ml"),
            ("Paper Cup", None, Decimal("1"), "piece"),
            ("Fresh Milk", "Large", Decimal("250"), "ml"),
        ]
        assert Decimal(body["lines"][0]["cost_per_unit_usd"]) == Decimal("0.02")

        get = await client.get(url, headers=_auth(s))
        assert get.status_code == status.HTTP_200_OK
        assert get.json()["lines"] == body["lines"]

        replaced = await client.put(
            url, headers=_auth(s), json={"lines": [_line(s["cup_id"], "2")]}
        )
        assert replaced.status_code == status.HTTP_200_OK
        assert [
            (line["inventory_item_id"], Decimal(line["quantity"]))
            for line in replaced.json()["lines"]
        ] == [(str(s["cup_id"]), Decimal("2"))]

        cleared = await client.put(url, headers=_auth(s), json={"lines": []})
        assert cleared.status_code == status.HTTP_200_OK
        assert cleared.json()["lines"] == []

    async with s["sessionmaker"]() as session:
        audits = await session.execute(
            select(AuditLog).where(
                AuditLog.action == "MENU_ITEM_RECIPE_REPLACED",
                AuditLog.resource_id == str(s["latte_id"]),
            )
        )
        assert len(audits.scalars().all()) == 3


@pytest.mark.anyio
async def test_recipe_payload_validation(bom_setup):
    """Duplicate lines and out-of-precision quantities are rejected with 422."""
    s = bom_setup
    url = _recipe_url(s["business_id"], s["latte_id"])
    async with _api(s) as client:
        duplicate = await client.put(
            url,
            headers=_auth(s),
            json={"lines": [_line(s["beans_id"], "18"), _line(s["beans_id"], "9")]},
        )
        assert duplicate.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

        for bad_quantity in ("0", "-1", "0.155"):
            res = await client.put(
                url,
                headers=_auth(s),
                json={"lines": [_line(s["beans_id"], bad_quantity)]},
            )
            assert res.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

        # The same ingredient in two scopes (all variants and Large) is allowed.
        scoped = await client.put(
            url,
            headers=_auth(s),
            json={
                "lines": [
                    _line(s["milk_id"], "150"),
                    _line(s["milk_id"], "250", s["large_id"]),
                ]
            },
        )
        assert scoped.status_code == status.HTTP_200_OK
        assert len(scoped.json()["lines"]) == 2


@pytest.mark.anyio
async def test_recipe_cross_tenant_references_return_404(bom_setup):
    """Foreign businesses, menu items, inventory items and variants are 404."""
    s = bom_setup
    own_url = _recipe_url(s["business_id"], s["latte_id"])
    async with _api(s) as client:
        await _put_recipe(client, s, s["latte_id"], [_line(s["beans_id"], "18")])

        foreign_inventory = await client.put(
            own_url,
            headers=_auth(s),
            json={"lines": [_line(s["rival_flour_id"], "1")]},
        )
        assert foreign_inventory.status_code == status.HTTP_404_NOT_FOUND
        assert foreign_inventory.json()["detail"] == "Inventory item not found."

        unknown_inventory = await client.put(
            own_url, headers=_auth(s), json={"lines": [_line(uuid4(), "1")]}
        )
        assert unknown_inventory.status_code == status.HTTP_404_NOT_FOUND

        # A variant of another menu item is not a variant of the croissant.
        foreign_variant = await client.put(
            _recipe_url(s["business_id"], s["croissant_id"]),
            headers=_auth(s),
            json={"lines": [_line(s["butter_id"], "10", s["large_id"])]},
        )
        assert foreign_variant.status_code == status.HTTP_404_NOT_FOUND
        assert foreign_variant.json()["detail"] == "Item variant not found."

        foreign_item_url = _recipe_url(s["business_id"], s["rival_dish_id"])
        assert (await client.get(foreign_item_url, headers=_auth(s))).status_code == (
            status.HTTP_404_NOT_FOUND
        )
        foreign_item_put = await client.put(
            foreign_item_url,
            headers=_auth(s),
            json={"lines": [_line(s["beans_id"], "1")]},
        )
        assert foreign_item_put.status_code == status.HTTP_404_NOT_FOUND

        foreign_business = await client.get(
            _recipe_url(s["rival_business_id"], s["rival_dish_id"]),
            headers=_auth(s),
        )
        assert foreign_business.status_code == status.HTTP_404_NOT_FOUND
        assert foreign_business.json()["detail"] == "Business not found."

        # The rival tenant cannot read or overwrite this tenant's recipe.
        rival_get = await client.get(own_url, headers=_auth(s, "rival_token"))
        assert rival_get.status_code == status.HTTP_404_NOT_FOUND
        rival_put = await client.put(
            own_url, headers=_auth(s, "rival_token"), json={"lines": []}
        )
        assert rival_put.status_code == status.HTTP_404_NOT_FOUND

        unchanged = await client.get(own_url, headers=_auth(s))
        assert [line["inventory_item_id"] for line in unchanged.json()["lines"]] == [
            str(s["beans_id"])
        ]


@pytest.mark.anyio
async def test_recipe_writes_need_inventory_permission_but_bumps_still_deplete(
    bom_setup,
):
    """Only inventory managers edit recipes; any kitchen bump still depletes stock."""
    s = bom_setup
    url = _recipe_url(s["business_id"], s["latte_id"])
    waiter = await _add_member(s, StaffRole.WAITER)
    kitchen = await _add_member(s, StaffRole.KITCHEN)
    menu_editor = await _add_member(s, StaffRole.MENU_EDITOR)
    inventory = await _add_member(s, StaffRole.INVENTORY)
    _, (item_id,) = await _create_order(s, [(s["latte_id"], None, 1)])

    async with _api(s) as client:
        body = {"lines": [_line(s["beans_id"], "18")]}
        for member in (waiter, kitchen, menu_editor):
            denied = await client.put(url, headers=member["headers"], json=body)
            assert denied.status_code == status.HTTP_403_FORBIDDEN
            assert denied.json()["detail"] == (
                "Your staff role does not allow this action."
            )
        unchanged = await client.get(url, headers=waiter["headers"])
        assert unchanged.status_code == status.HTTP_200_OK
        assert unchanged.json()["lines"] == []

        allowed = await client.put(url, headers=inventory["headers"], json=body)
        assert allowed.status_code == status.HTTP_200_OK, allowed.text
        assert [line["inventory_item_id"] for line in allowed.json()["lines"]] == [
            str(s["beans_id"])
        ]

        readable = await client.get(url, headers=kitchen["headers"])
        assert readable.status_code == status.HTTP_200_OK
        assert len(readable.json()["lines"]) == 1

        bumped = await client.post(
            f"/api/v1/businesses/{s['business_id']}/branches/{s['branch_id']}"
            f"/kds/items/{item_id}/bump",
            headers=kitchen["headers"],
            json={"target_status": "cooking"},
        )
        assert bumped.status_code == status.HTTP_200_OK, bumped.text

    (log,) = await _logs(s, [item_id])
    assert log.adjusted_by_user_id == kitchen["user_id"]
    assert await _quantity(s, "beans_id") == Decimal("982.00")


# ==============================================================================
# Depletion
# ==============================================================================


@pytest.mark.anyio
async def test_bump_depletes_stock_once_across_repeat_bump_and_undo(bom_setup):
    """The first kitchen bump depletes; repeat bumps and undo/redo never repeat it."""
    s = bom_setup
    _, (item_id,) = await _create_order(s, [(s["latte_id"], s["large_id"], 2)])
    async with _api(s) as client:
        await _put_recipe(
            client,
            s,
            s["latte_id"],
            [
                _line(s["beans_id"], "18"),
                _line(s["milk_id"], "150"),
                _line(s["milk_id"], "250", s["large_id"]),
                _line(s["cup_id"], "1"),
            ],
        )

        await _bump(client, s, item_id, "cooking")
        depleted_at = (await _order_item(s, item_id)).stock_depleted_at
        assert depleted_at is not None

        await _bump(client, s, item_id, "cooking")
        await _bump(client, s, item_id, "ready_to_serve")
        undo = await client.post(
            f"/api/v1/businesses/{s['business_id']}/branches/{s['branch_id']}"
            f"/kds/items/{item_id}/undo",
            headers=_auth(s),
        )
        assert undo.status_code == status.HTTP_200_OK
        assert undo.json()["status"] == "preparing"
        await _bump(client, s, item_id, "cooking")
        await _bump(client, s, item_id, "served")

    assert await _quantity(s, "beans_id") == Decimal("964.00")
    assert await _quantity(s, "milk_id") == Decimal("1500.00")
    assert await _quantity(s, "cup_id") == Decimal("48.00")
    assert (await _order_item(s, item_id)).stock_depleted_at == depleted_at

    logs = await _logs(s, [item_id])
    assert len(logs) == 3
    by_item = {log.inventory_item_id: log for log in logs}
    milk_log = by_item[s["milk_id"]]
    assert milk_log.reason == StockAdjustmentReason.RECIPE_DEPLETION
    assert milk_log.quantity_change == Decimal("-500.00")
    assert milk_log.previous_quantity == Decimal("2000.00")
    assert milk_log.new_quantity == Decimal("1500.00")
    assert milk_log.unit_cost_usd == Decimal("0.0030")
    assert milk_log.adjusted_by_user_id == s["owner_id"]
    assert milk_log.branch_id == s["branch_id"]
    assert by_item[s["beans_id"]].quantity_change == Decimal("-36.00")
    assert by_item[s["cup_id"]].quantity_change == Decimal("-2.00")


@pytest.mark.anyio
async def test_variant_lines_override_all_variant_lines(bom_setup):
    """Variant lines replace the all-variants line for the same ingredient only."""
    s = bom_setup
    order_id, (large_id, small_id, plain_id) = await _create_order(
        s,
        [
            (s["latte_id"], s["large_id"], 1),
            (s["latte_id"], s["small_id"], 1),
            (s["latte_id"], None, 1),
        ],
    )
    async with _api(s) as client:
        await _put_recipe(
            client,
            s,
            s["latte_id"],
            [
                _line(s["beans_id"], "18"),
                _line(s["milk_id"], "150"),
                _line(s["milk_id"], "250", s["large_id"]),
                _line(s["cup_id"], "1", s["small_id"]),
            ],
        )
        # One station bump depletes the whole ticket in a single transaction.
        res = await client.post(
            f"/api/v1/businesses/{s['business_id']}/branches/{s['branch_id']}"
            f"/kds/orders/{order_id}/station/{s['station_id']}/bump",
            headers=_auth(s),
            json={"target_status": "cooking"},
        )
        assert res.status_code == status.HTTP_200_OK, res.text

    logs = await _logs(s, [large_id, small_id, plain_id])
    consumed: dict[UUID, dict[UUID, Decimal]] = {}
    for log in logs:
        assert log.order_item_id is not None
        consumed.setdefault(log.order_item_id, {})[
            log.inventory_item_id
        ] = -log.quantity_change
    assert consumed[large_id] == {
        s["beans_id"]: Decimal("18.00"),
        s["milk_id"]: Decimal("250.00"),
    }
    assert consumed[small_id] == {
        s["beans_id"]: Decimal("18.00"),
        s["milk_id"]: Decimal("150.00"),
        s["cup_id"]: Decimal("1.00"),
    }
    assert consumed[plain_id] == {
        s["beans_id"]: Decimal("18.00"),
        s["milk_id"]: Decimal("150.00"),
    }

    assert await _quantity(s, "beans_id") == Decimal("946.00")
    assert await _quantity(s, "milk_id") == Decimal("1450.00")
    assert await _quantity(s, "cup_id") == Decimal("49.00")

    # Entries for one ingredient chain from the opening to the closing balance.
    bean_logs = [log for log in logs if log.inventory_item_id == s["beans_id"]]
    balances = [(log.previous_quantity, log.new_quantity) for log in bean_logs]
    assert balances == [
        (Decimal("1000.00"), Decimal("982.00")),
        (Decimal("982.00"), Decimal("964.00")),
        (Decimal("964.00"), Decimal("946.00")),
    ]


@pytest.mark.anyio
async def test_negative_stock_is_allowed_logged_and_alerted(bom_setup):
    """Depletion never blocks the kitchen: stock may go negative or be created."""
    s = bom_setup
    _, (item_id,) = await _create_order(s, [(s["croissant_id"], None, 3)])
    async with _api(s) as client:
        await _put_recipe(
            client,
            s,
            s["croissant_id"],
            [_line(s["butter_id"], "2.5"), _line(s["syrup_id"], "10")],
        )
        await _bump(client, s, item_id, "preparing")

        alerts = await client.get(
            f"/api/v1/businesses/{s['business_id']}/inventory/alerts/low-stock",
            headers=_auth(s),
            params={"branch_id": str(s["branch_id"])},
        )
        assert alerts.status_code == status.HTTP_200_OK
        alerted = {
            alert["inventory_item_id"]: Decimal(alert["current_quantity"])
            for alert in alerts.json()["alerts"]
        }
        assert alerted[str(s["butter_id"])] == Decimal("-2.50")
        assert alerted[str(s["syrup_id"])] == Decimal("-30.00")

    butter = await _stock(s, "butter_id")
    assert butter is not None
    assert butter.quantity == Decimal("-2.50")

    syrup = await _stock(s, "syrup_id")
    assert syrup is not None, "missing branch stock row must be created"
    assert syrup.quantity == Decimal("-30.00")
    assert syrup.reorder_threshold == Decimal("10.00")
    assert syrup.organization_id == s["org_id"]

    by_item = {log.inventory_item_id: log for log in await _logs(s, [item_id])}
    assert by_item[s["butter_id"]].previous_quantity == Decimal("5.00")
    assert by_item[s["butter_id"]].new_quantity == Decimal("-2.50")
    assert by_item[s["butter_id"]].quantity_change == Decimal("-7.50")
    assert by_item[s["syrup_id"]].previous_quantity == Decimal("0.00")
    assert by_item[s["syrup_id"]].new_quantity == Decimal("-30.00")


@pytest.mark.anyio
async def test_item_without_recipe_is_never_depleted_retroactively(bom_setup):
    """An item cooked before its recipe existed is marked and never depleted later."""
    s = bom_setup
    _, (item_id,) = await _create_order(s, [(s["water_id"], None, 1)])
    async with _api(s) as client:
        await _bump(client, s, item_id, "cooking")
        assert (await _order_item(s, item_id)).stock_depleted_at is not None

        await _put_recipe(client, s, s["water_id"], [_line(s["cup_id"], "1")])
        await _bump(client, s, item_id, "ready_to_serve")

    assert await _logs(s, [item_id]) == []
    assert await _quantity(s, "cup_id") == Decimal("50.00")


@pytest.mark.anyio
async def test_manual_adjustment_cannot_use_recipe_reasons(bom_setup):
    """Recipe depletion and waste reasons are reserved for the system."""
    s = bom_setup
    url = (
        f"/api/v1/businesses/{s['business_id']}/inventory/branches/"
        f"{s['branch_id']}/stock/adjust"
    )
    async with _api(s) as client:
        for reason in ("recipe_depletion", "recipe_waste"):
            res = await client.post(
                url,
                headers=_auth(s),
                json={
                    "inventory_item_id": str(s["beans_id"]),
                    "quantity_change": "-5",
                    "reason": reason,
                },
            )
            assert res.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


# ==============================================================================
# Voids
# ==============================================================================


@pytest.mark.anyio
async def test_void_after_depletion_is_recorded_as_waste(bom_setup):
    """A void after depletion keeps the stock out and writes zero-change waste."""
    s = bom_setup
    order_id, (cooked_id, pending_id) = await _create_order(
        s, [(s["latte_id"], None, 2), (s["latte_id"], None, 1)]
    )
    void_base = (
        f"/api/v1/businesses/{s['business_id']}/branches/{s['branch_id']}"
        f"/orders/{order_id}/items"
    )
    async with _api(s) as client:
        await _put_recipe(
            client,
            s,
            s["latte_id"],
            [_line(s["beans_id"], "18"), _line(s["cup_id"], "1")],
        )
        await _bump(client, s, cooked_id, "cooking")

        voided = await client.post(
            f"{void_base}/{cooked_id}/void",
            headers=_auth(s),
            json={"void_reason_code": "quality_issue"},
        )
        assert voided.status_code == status.HTTP_200_OK, voided.text

        # Voiding before depletion touches nothing.
        voided_early = await client.post(
            f"{void_base}/{pending_id}/void",
            headers=_auth(s),
            json={"void_reason_code": "guest_changed_mind"},
        )
        assert voided_early.status_code == status.HTTP_200_OK, voided_early.text

    assert await _quantity(s, "beans_id") == Decimal("964.00")
    assert await _quantity(s, "cup_id") == Decimal("48.00")
    assert await _logs(s, [pending_id]) == []
    assert (await _order_item(s, pending_id)).stock_depleted_at is None

    logs = await _logs(s, [cooked_id])
    waste = [log for log in logs if log.reason == StockAdjustmentReason.RECIPE_WASTE]
    depletion = [
        log for log in logs if log.reason == StockAdjustmentReason.RECIPE_DEPLETION
    ]
    assert len(depletion) == 2
    assert len(waste) == 2
    waste_by_item = {log.inventory_item_id: log for log in waste}
    beans_waste = waste_by_item[s["beans_id"]]
    assert beans_waste.quantity_change == Decimal("0.00")
    assert beans_waste.previous_quantity == Decimal("964.00")
    assert beans_waste.new_quantity == Decimal("964.00")
    assert beans_waste.unit_cost_usd == Decimal("0.0200")
    assert beans_waste.adjusted_by_user_id == s["owner_id"]
    assert beans_waste.notes is not None
    assert "voided after preparation" in beans_waste.notes
    assert "36.00 g" in beans_waste.notes


@pytest.mark.anyio
async def test_every_void_path_records_waste_once(bom_setup):
    """KDS voids and order cancellation record waste once per depleted item."""
    s = bom_setup
    order_id, (kds_voided_id, cancelled_id, never_cooked_id) = await _create_order(
        s,
        [
            (s["latte_id"], None, 1),
            (s["latte_id"], None, 1),
            (s["latte_id"], None, 1),
        ],
    )
    async with _api(s) as client:
        await _put_recipe(client, s, s["latte_id"], [_line(s["beans_id"], "18")])
        await _bump(client, s, kds_voided_id, "cooking")
        await _bump(client, s, cancelled_id, "cooking")

        await _bump(client, s, kds_voided_id, "voided")
        cancel = await client.post(
            f"/api/v1/businesses/{s['business_id']}/branches/{s['branch_id']}"
            f"/orders/{order_id}/cancel",
            headers=_auth(s),
            json={"cancel_reason_code": "out_of_stock"},
        )
        assert cancel.status_code == status.HTTP_200_OK, cancel.text
        # A repeated KDS void of an already voided item adds nothing.
        await _bump(client, s, kds_voided_id, "voided")

    logs = await _logs(s, [kds_voided_id, cancelled_id, never_cooked_id])
    waste_counts: dict[UUID, int] = {}
    for log in logs:
        if log.reason == StockAdjustmentReason.RECIPE_WASTE:
            assert log.order_item_id is not None
            waste_counts[log.order_item_id] = waste_counts.get(log.order_item_id, 0) + 1
    assert waste_counts == {kds_voided_id: 1, cancelled_id: 1}
    assert await _quantity(s, "beans_id") == Decimal("964.00")


# ==============================================================================
# COGS analytics
# ==============================================================================


@pytest.mark.anyio
async def test_overview_reports_cogs_and_gross_margin(bom_setup):
    """COGS sums depleted quantity x snapshotted cost, scoped by branch and period."""
    s = bom_setup
    # Per latte: 18 g beans x 0.02 + 150 ml milk x 0.003 + 1 cup x 0.05 = 0.86
    _, (main_item_id,) = await _create_order(
        s, [(s["latte_id"], None, 2)], subtotal="6.00"
    )
    riverside_order_id, (riverside_item_id,) = await _create_order(
        s, [(s["latte_id"], None, 1)], branch_key="branch_two_id", subtotal="2.50"
    )
    async with s["sessionmaker"]() as session:
        # A depletion logged a month ago falls outside a "last day" period.
        session.add(
            StockAdjustmentLog(
                organization_id=s["org_id"],
                business_id=s["business_id"],
                branch_id=s["branch_id"],
                inventory_item_id=s["beans_id"],
                quantity_change=Decimal("-100.00"),
                previous_quantity=Decimal("100.00"),
                new_quantity=Decimal("0.00"),
                reason=StockAdjustmentReason.RECIPE_DEPLETION,
                adjusted_by_user_id=s["owner_id"],
                unit_cost_usd=Decimal("1.0000"),
                created_at=datetime.now(timezone.utc) - timedelta(days=30),
            )
        )
        await session.commit()

    overview_url = f"/api/v1/businesses/{s['business_id']}/analytics/overview"
    since = {"start_date": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()}

    async def overview(client: AsyncClient, **params: str) -> dict[str, Decimal]:
        res = await client.get(overview_url, headers=_auth(s), params=params)
        assert res.status_code == status.HTTP_200_OK, res.text
        data = res.json()
        return {
            key: Decimal(str(data[key]))
            for key in (
                "total_gross_sales_usd",
                "cost_of_goods_usd",
                "gross_margin_usd",
                "gross_margin_percent",
            )
        }

    async with _api(s) as client:
        await _put_recipe(
            client,
            s,
            s["latte_id"],
            [
                _line(s["beans_id"], "18"),
                _line(s["milk_id"], "150"),
                _line(s["cup_id"], "1"),
            ],
        )
        no_depletion_yet = await overview(client, **since)
        assert no_depletion_yet["cost_of_goods_usd"] == Decimal("0.00")
        assert no_depletion_yet["gross_margin_percent"] == Decimal("100.00")

        await _bump(client, s, main_item_id, "cooking")
        await _bump(client, s, riverside_item_id, "cooking", "branch_two_id")

        network = await overview(client, **since)
        assert network == {
            "total_gross_sales_usd": Decimal("8.50"),
            "cost_of_goods_usd": Decimal("2.58"),
            "gross_margin_usd": Decimal("5.92"),
            "gross_margin_percent": Decimal("69.65"),
        }

        main_branch = await overview(client, branch_id=str(s["branch_id"]), **since)
        assert main_branch == {
            "total_gross_sales_usd": Decimal("6.00"),
            "cost_of_goods_usd": Decimal("1.72"),
            "gross_margin_usd": Decimal("4.28"),
            "gross_margin_percent": Decimal("71.33"),
        }

        all_time = await overview(client)
        assert all_time["cost_of_goods_usd"] == Decimal("102.58")

        # Voiding after depletion drops the revenue but keeps the cost (waste).
        voided = await client.post(
            f"/api/v1/businesses/{s['business_id']}/branches/{s['branch_two_id']}"
            f"/orders/{riverside_order_id}/items/{riverside_item_id}/void",
            headers=_auth(s),
            json={"void_reason_code": "quality_issue"},
        )
        assert voided.status_code == status.HTTP_200_OK, voided.text
        after_void = await overview(client, **since)
        assert after_void == {
            "total_gross_sales_usd": Decimal("6.00"),
            "cost_of_goods_usd": Decimal("2.58"),
            "gross_margin_usd": Decimal("3.42"),
            "gross_margin_percent": Decimal("57.00"),
        }

        # Another tenant sees none of this tenant's cost data.
        rival = await client.get(
            f"/api/v1/businesses/{s['rival_business_id']}/analytics/overview",
            headers=_auth(s, "rival_token"),
        )
        assert rival.status_code == status.HTTP_200_OK
        assert Decimal(str(rival.json()["cost_of_goods_usd"])) == Decimal("0.00")
