"""
Recipe (bill of materials) stock depletion and void waste tracking.

Policy:

- Depletion runs once per order item, the first time the item reaches a kitchen
  status (PREPARING, COOKING, READY_TO_SERVE or SERVED). Reaching READY or SERVED
  directly still counts, because the dish was made. ``OrderItem.stock_depleted_at``
  is claimed with an atomic conditional UPDATE, so a repeated bump, an undo/redo or
  two concurrent bumps never deplete twice. The claim is kept even when the item
  has no recipe, so a recipe added later never depletes an order already cooked.
- Each effective recipe line lowers the branch stock by ``line quantity x item
  quantity`` with an atomic ``UPDATE ... SET quantity = quantity - :q``. A missing
  branch stock row is created first. Stock may go negative: the kitchen is never
  blocked; a warning is logged and the low-stock alert surfaces it.
- Each depleted line writes a RECIPE_DEPLETION ``StockAdjustmentLog`` linked to the
  order item and carrying the inventory item's unit cost at that moment, which is
  what COGS analytics sums.
- Voiding an item after depletion keeps the depletion, because the ingredients
  were used. Each depleted line gets a zero-change RECIPE_WASTE entry as the
  explicit waste marker; the wasted amount is the linked depletion entry. Voiding
  before depletion touches nothing.

Callers own the transaction: nothing here commits.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import structlog
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.expression import Executable

from app.models.enums import OrderItemStatus, StockAdjustmentReason
from app.models.inventory import BranchStock, InventoryItem, StockAdjustmentLog
from app.models.menu_item_recipe import MenuItemRecipe
from app.models.order import Order, OrderItem

logger = structlog.get_logger("app.services.recipe_depletion_service")

DEPLETION_TRIGGER_STATUSES = frozenset(
    {
        OrderItemStatus.PREPARING,
        OrderItemStatus.COOKING,
        OrderItemStatus.READY_TO_SERVE,
        OrderItemStatus.SERVED,
    }
)

ZERO_QUANTITY = Decimal("0.00")


@dataclass(frozen=True)
class _RecipeLine:
    """A recipe line joined with the inventory item fields depletion needs."""

    variant_id: UUID | None
    inventory_item_id: UUID
    quantity: Decimal
    unit_cost_usd: Decimal
    reorder_threshold: Decimal
    ideal_stock_quantity: Decimal


@dataclass(frozen=True)
class _Depletion:
    """The stock one order item consumes for one recipe line."""

    order_item: OrderItem
    line: _RecipeLine
    quantity: Decimal


async def sync_recipe_stock_for_status(
    session: AsyncSession,
    *,
    order: Order,
    items: Sequence[OrderItem],
    target_status: OrderItemStatus,
    user_id: UUID,
) -> None:
    """
    Applies the inventory side effects of moving order items to ``target_status``.

    Kitchen statuses deplete recipe stock (once per item); VOIDED records the
    depleted ingredients as waste. Other statuses do nothing. Does not commit.
    """
    if target_status in DEPLETION_TRIGGER_STATUSES:
        await deplete_recipe_stock(session, order=order, items=items, user_id=user_id)
    elif target_status == OrderItemStatus.VOIDED:
        await record_recipe_waste(session, order=order, items=items, user_id=user_id)


async def deplete_recipe_stock(
    session: AsyncSession,
    *,
    order: Order,
    items: Sequence[OrderItem],
    user_id: UUID,
) -> None:
    """
    Depletes the order's branch stock by the recipes of items not yet depleted.

    Claims ``stock_depleted_at`` atomically, then for every effective recipe line
    subtracts ``line quantity x item quantity`` from branch stock and writes a
    RECIPE_DEPLETION log with the unit cost snapshot. Stock may go negative.
    Does not commit.
    """
    pending = {item.id: item for item in items if item.stock_depleted_at is None}
    if not pending:
        return

    claimed = await _claim_items_for_depletion(session, pending)
    if not claimed:
        return

    recipes = await _load_recipe_lines(
        session, order, {item.menu_item_id for item in claimed}
    )
    by_inventory_item: dict[UUID, list[_Depletion]] = defaultdict(list)
    for item in claimed:
        if item.quantity <= 0:
            continue
        lines = _effective_lines(
            recipes.get(item.menu_item_id, []), item.item_variant_id
        )
        for line in lines:
            by_inventory_item[line.inventory_item_id].append(
                _Depletion(
                    order_item=item,
                    line=line,
                    quantity=line.quantity * item.quantity,
                )
            )

    # Touch branch stock rows in a stable order so concurrent depletions that
    # share ingredients lock rows in the same sequence and cannot deadlock.
    line_count = 0
    for inventory_item_id in sorted(by_inventory_item):
        depletions = by_inventory_item[inventory_item_id]
        total = sum((d.quantity for d in depletions), ZERO_QUANTITY)
        new_quantity = await _decrement_branch_stock(
            session, order=order, line=depletions[0].line, quantity=total
        )

        running = new_quantity + total
        for depletion in depletions:
            previous = running
            running = previous - depletion.quantity
            session.add(
                StockAdjustmentLog(
                    organization_id=order.organization_id,
                    business_id=order.business_id,
                    branch_id=order.branch_id,
                    inventory_item_id=inventory_item_id,
                    quantity_change=-depletion.quantity,
                    previous_quantity=previous,
                    new_quantity=running,
                    reason=StockAdjustmentReason.RECIPE_DEPLETION,
                    notes=_depletion_note(order, depletion.order_item),
                    adjusted_by_user_id=user_id,
                    unit_cost_usd=depletion.line.unit_cost_usd,
                    order_item_id=depletion.order_item.id,
                )
            )
            line_count += 1

        if new_quantity < 0:
            logger.warning(
                "Recipe depletion left branch stock negative",
                organization_id=str(order.organization_id),
                branch_id=str(order.branch_id),
                inventory_item_id=str(inventory_item_id),
                order_id=str(order.id),
                new_quantity=str(new_quantity),
            )

    if line_count:
        logger.info(
            "Recipe stock depleted",
            organization_id=str(order.organization_id),
            branch_id=str(order.branch_id),
            order_id=str(order.id),
            order_item_count=len(claimed),
            stock_log_count=line_count,
        )


async def record_recipe_waste(
    session: AsyncSession,
    *,
    order: Order,
    items: Sequence[OrderItem],
    user_id: UUID,
) -> None:
    """
    Records the depleted ingredients of voided order items as waste.

    Stock is not restored: once depleted, the ingredients were used. For every
    RECIPE_DEPLETION entry of a voided item, a RECIPE_WASTE entry with zero
    quantity change is written as the waste marker, carrying the same unit cost
    and order item link. Items voided before depletion and items whose waste is
    already recorded are skipped. Does not commit.
    """
    voided_ids = [
        item.id
        for item in items
        if item.status == OrderItemStatus.VOIDED and item.stock_depleted_at is not None
    ]
    if not voided_ids:
        return

    entries_res = await session.execute(
        select(
            StockAdjustmentLog.order_item_id,
            StockAdjustmentLog.inventory_item_id,
            StockAdjustmentLog.quantity_change,
            StockAdjustmentLog.unit_cost_usd,
            StockAdjustmentLog.reason,
            InventoryItem.unit_of_measure,
        )
        .join(InventoryItem, InventoryItem.id == StockAdjustmentLog.inventory_item_id)
        .where(
            StockAdjustmentLog.organization_id == order.organization_id,
            StockAdjustmentLog.order_item_id.in_(voided_ids),
            StockAdjustmentLog.reason.in_(
                [
                    StockAdjustmentReason.RECIPE_DEPLETION,
                    StockAdjustmentReason.RECIPE_WASTE,
                ]
            ),
        )
    )
    entries = entries_res.all()
    already_wasted = {
        e.order_item_id
        for e in entries
        if e.reason == StockAdjustmentReason.RECIPE_WASTE
    }
    to_waste = [
        e
        for e in entries
        if e.reason == StockAdjustmentReason.RECIPE_DEPLETION
        and e.order_item_id not in already_wasted
    ]
    if not to_waste:
        return

    stock_res = await session.execute(
        select(BranchStock.inventory_item_id, BranchStock.quantity).where(
            BranchStock.branch_id == order.branch_id,
            BranchStock.inventory_item_id.in_({e.inventory_item_id for e in to_waste}),
        )
    )
    stock_levels: dict[UUID, Decimal] = {
        row.inventory_item_id: row.quantity for row in stock_res.all()
    }
    items_by_id = {item.id: item for item in items}

    for entry in to_waste:
        current = stock_levels.get(entry.inventory_item_id, ZERO_QUANTITY)
        item_name = items_by_id[entry.order_item_id].item_name_en
        session.add(
            StockAdjustmentLog(
                organization_id=order.organization_id,
                business_id=order.business_id,
                branch_id=order.branch_id,
                inventory_item_id=entry.inventory_item_id,
                quantity_change=ZERO_QUANTITY,
                previous_quantity=current,
                new_quantity=current,
                reason=StockAdjustmentReason.RECIPE_WASTE,
                notes=(
                    f"Order {order.order_number}: {item_name} voided after "
                    f"preparation; {-entry.quantity_change} "
                    f"{entry.unit_of_measure.value} depleted for it is waste."
                ),
                adjusted_by_user_id=user_id,
                unit_cost_usd=entry.unit_cost_usd,
                order_item_id=entry.order_item_id,
            )
        )

    logger.info(
        "Recipe waste recorded for voided items",
        organization_id=str(order.organization_id),
        branch_id=str(order.branch_id),
        order_id=str(order.id),
        order_item_count=len({e.order_item_id for e in to_waste}),
        stock_log_count=len(to_waste),
    )


async def _claim_items_for_depletion(
    session: AsyncSession,
    pending: dict[UUID, OrderItem],
) -> list[OrderItem]:
    """
    Atomically marks pending items as depleted and returns the ones this call won.

    The conditional UPDATE only matches rows whose ``stock_depleted_at`` is still
    NULL, so a concurrent request that already claimed an item excludes it here.
    """
    claim_res = await session.execute(
        update(OrderItem)
        .where(
            OrderItem.id.in_(list(pending)),
            OrderItem.stock_depleted_at.is_(None),
        )
        .values(stock_depleted_at=datetime.now(timezone.utc))
        .returning(OrderItem.id)
    )
    return [pending[item_id] for item_id in claim_res.scalars().all()]


async def _load_recipe_lines(
    session: AsyncSession,
    order: Order,
    menu_item_ids: set[UUID],
) -> dict[UUID, list[_RecipeLine]]:
    """Loads the recipe lines of the given menu items, keyed by menu item id."""
    result = await session.execute(
        select(
            MenuItemRecipe.menu_item_id,
            MenuItemRecipe.variant_id,
            MenuItemRecipe.inventory_item_id,
            MenuItemRecipe.quantity,
            InventoryItem.cost_per_unit_usd,
            InventoryItem.reorder_threshold,
            InventoryItem.ideal_stock_quantity,
        )
        .join(InventoryItem, InventoryItem.id == MenuItemRecipe.inventory_item_id)
        .where(
            MenuItemRecipe.menu_item_id.in_(menu_item_ids),
            MenuItemRecipe.organization_id == order.organization_id,
            MenuItemRecipe.business_id == order.business_id,
            InventoryItem.organization_id == order.organization_id,
            InventoryItem.business_id == order.business_id,
        )
    )
    lines: dict[UUID, list[_RecipeLine]] = defaultdict(list)
    for row in result.all():
        lines[row.menu_item_id].append(
            _RecipeLine(
                variant_id=row.variant_id,
                inventory_item_id=row.inventory_item_id,
                quantity=row.quantity,
                unit_cost_usd=row.cost_per_unit_usd,
                reorder_threshold=row.reorder_threshold,
                ideal_stock_quantity=row.ideal_stock_quantity,
            )
        )
    return lines


def _effective_lines(
    lines: Sequence[_RecipeLine],
    variant_id: UUID | None,
) -> list[_RecipeLine]:
    """
    Resolves the recipe lines that apply to one ordered variant.

    All-variants lines (``variant_id`` NULL) apply to every variant; a line for
    the ordered variant overrides the all-variants line for the same inventory item.
    """
    effective: dict[UUID, _RecipeLine] = {
        line.inventory_item_id: line for line in lines if line.variant_id is None
    }
    if variant_id is not None:
        for line in lines:
            if line.variant_id == variant_id:
                effective[line.inventory_item_id] = line
    return list(effective.values())


async def _decrement_branch_stock(
    session: AsyncSession,
    *,
    order: Order,
    line: _RecipeLine,
    quantity: Decimal,
) -> Decimal:
    """
    Atomically subtracts ``quantity`` from the branch stock and returns the result.

    Uses ``UPDATE ... SET quantity = quantity - :q RETURNING quantity`` so there is
    no read-modify-write race. When the branch has no stock row for the item yet,
    one is inserted (ignoring a concurrent insert) and the update is retried.
    """
    decrement = (
        update(BranchStock)
        .where(
            BranchStock.branch_id == order.branch_id,
            BranchStock.inventory_item_id == line.inventory_item_id,
        )
        .values(quantity=BranchStock.quantity - quantity)
        .returning(BranchStock.quantity)
    )
    new_quantity = (await session.execute(decrement)).scalar_one_or_none()
    if new_quantity is not None:
        return new_quantity

    await session.execute(_insert_missing_branch_stock(session, order, line))
    return (await session.execute(decrement)).scalar_one()


def _insert_missing_branch_stock(
    session: AsyncSession,
    order: Order,
    line: _RecipeLine,
) -> Executable:
    """
    Builds an ``INSERT ... ON CONFLICT DO NOTHING`` for a zero branch stock row.

    PostgreSQL is the target; SQLite (used by the test suite) shares the syntax.
    """
    values = {
        "organization_id": order.organization_id,
        "business_id": order.business_id,
        "branch_id": order.branch_id,
        "inventory_item_id": line.inventory_item_id,
        "quantity": ZERO_QUANTITY,
        "reorder_threshold": line.reorder_threshold,
        "ideal_stock_quantity": line.ideal_stock_quantity,
    }
    conflict_columns = ["branch_id", "inventory_item_id"]
    if session.get_bind().dialect.name == "sqlite":
        return (
            sqlite_insert(BranchStock)
            .values(**values)
            .on_conflict_do_nothing(index_elements=conflict_columns)
        )
    return (
        postgresql_insert(BranchStock)
        .values(**values)
        .on_conflict_do_nothing(index_elements=conflict_columns)
    )


def _depletion_note(order: Order, item: OrderItem) -> str:
    """Builds the human-readable note of a recipe depletion log entry."""
    variant = f" ({item.variant_name_en})" if item.variant_name_en else ""
    return (
        f"Recipe depletion for order {order.order_number}: "
        f"{item.quantity} x {item.item_name_en}{variant}"
    )
