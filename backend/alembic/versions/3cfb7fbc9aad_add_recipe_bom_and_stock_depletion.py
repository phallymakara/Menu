"""add recipe bom and stock depletion tracking

Adds menu item recipes (bill of materials) and the columns that recipe stock
depletion needs:

- ``menu_item_recipes``: one ingredient line per (menu item, variant, inventory
  item). ``variant_id`` NULL means the line applies to every variant, so the
  uniqueness is two NULL-safe partial unique indexes.
- ``order_items.stock_depleted_at``: set once when an item's recipe is depleted,
  which makes depletion idempotent across repeated bumps and undo/redo.
- ``stock_adjustment_logs.unit_cost_usd``: unit cost snapshot used for COGS.
- ``stock_adjustment_logs.order_item_id``: links depletion and waste entries to
  the order item that caused them.

The new ``recipe_depletion`` and ``recipe_waste`` adjustment reasons need no DDL:
``stock_adjustment_logs.reason`` is a non-native enum (VARCHAR(30), no CHECK).

Revision ID: 3cfb7fbc9aad
Revises: 547f4d2dd11d
Create Date: 2026-10-05 23:34:18.094893

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3cfb7fbc9aad"
down_revision: str | Sequence[str] | None = "547f4d2dd11d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "menu_item_recipes",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("menu_item_id", sa.Uuid(), nullable=False),
        sa.Column("variant_id", sa.Uuid(), nullable=True),
        sa.Column("inventory_item_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_menu_item_recipes_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["inventory_item_id"],
            ["inventory_items.id"],
            name=op.f("fk_menu_item_recipes_inventory_item_id_inventory_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["menu_item_id"],
            ["menu_items.id"],
            name=op.f("fk_menu_item_recipes_menu_item_id_menu_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_menu_item_recipes_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["variant_id"],
            ["item_variants.id"],
            name=op.f("fk_menu_item_recipes_variant_id_item_variants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_menu_item_recipes")),
    )
    for column in (
        "business_id",
        "inventory_item_id",
        "menu_item_id",
        "organization_id",
        "variant_id",
    ):
        op.create_index(
            op.f(f"ix_menu_item_recipes_{column}"), "menu_item_recipes", [column]
        )
    op.create_index(
        "uq_menu_item_recipes_all_variants",
        "menu_item_recipes",
        ["menu_item_id", "inventory_item_id"],
        unique=True,
        postgresql_where=sa.text("variant_id IS NULL"),
        sqlite_where=sa.text("variant_id IS NULL"),
    )
    op.create_index(
        "uq_menu_item_recipes_variant",
        "menu_item_recipes",
        ["menu_item_id", "variant_id", "inventory_item_id"],
        unique=True,
        postgresql_where=sa.text("variant_id IS NOT NULL"),
        sqlite_where=sa.text("variant_id IS NOT NULL"),
    )

    op.add_column(
        "order_items",
        sa.Column(
            "stock_depleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment=(
                "When recipe depletion ran for this item; set once so it never repeats"
            ),
        ),
    )

    op.add_column(
        "stock_adjustment_logs",
        sa.Column("unit_cost_usd", sa.Numeric(precision=12, scale=4), nullable=True),
    )
    op.add_column(
        "stock_adjustment_logs",
        sa.Column("order_item_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_stock_adjustment_logs_order_item_id_order_items"),
        "stock_adjustment_logs",
        "order_items",
        ["order_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_stock_adjustment_logs_order_item_id"),
        "stock_adjustment_logs",
        ["order_item_id"],
    )


def downgrade() -> None:
    """Downgrade schema.

    The previous revision's ``StockAdjustmentReason`` has no recipe reasons, so
    recipe entries are relabelled ``OTHER`` to stay loadable. Their notes still
    describe the depletion or waste, and stock levels are left as they are.
    """
    op.execute(
        "UPDATE stock_adjustment_logs SET reason = 'OTHER' "
        "WHERE reason IN ('RECIPE_DEPLETION', 'RECIPE_WASTE')"
    )
    op.drop_index(
        op.f("ix_stock_adjustment_logs_order_item_id"),
        table_name="stock_adjustment_logs",
    )
    op.drop_constraint(
        op.f("fk_stock_adjustment_logs_order_item_id_order_items"),
        "stock_adjustment_logs",
        type_="foreignkey",
    )
    op.drop_column("stock_adjustment_logs", "order_item_id")
    op.drop_column("stock_adjustment_logs", "unit_cost_usd")
    op.drop_column("order_items", "stock_depleted_at")

    op.drop_index("uq_menu_item_recipes_variant", table_name="menu_item_recipes")
    op.drop_index("uq_menu_item_recipes_all_variants", table_name="menu_item_recipes")
    for column in (
        "business_id",
        "inventory_item_id",
        "menu_item_id",
        "organization_id",
        "variant_id",
    ):
        op.drop_index(
            op.f(f"ix_menu_item_recipes_{column}"), table_name="menu_item_recipes"
        )
    op.drop_table("menu_item_recipes")
