"""create inventory tables and fix postgres-only schema drift

The inventory models (inventory items, branch stock, stock transfers, transfer
items, and adjustment logs) were never migrated, so every inventory endpoint
failed on a database built with ``alembic upgrade head``. The test suite builds its
schema with ``create_all``, which hid this.

Also fixes drift that only breaks on PostgreSQL:
- ``menu_items.image_url`` was VARCHAR(500) while the API accepts 2048 characters.
- Menu item SKU uniqueness was still (business_id, sku), so a branch-local item
  could not reuse a master SKU. It is now two NULL-safe partial unique indexes.
- The ``membership_status`` type lacked the ``archived`` value the API accepts.
- Indexes declared on the models for combo groups and modifier options.

Revision ID: 547f4d2dd11d
Revises: l1a2b3c4d5e6
Create Date: 2026-10-05 22:59:48.470942

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "547f4d2dd11d"
down_revision: str | Sequence[str] | None = "l1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
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
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "stock_transfers",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("transfer_number", sa.String(length=50), nullable=False),
        sa.Column("source_branch_id", sa.Uuid(), nullable=False),
        sa.Column("destination_branch_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "REQUESTED",
                "APPROVED",
                "REJECTED",
                "IN_TRANSIT",
                "COMPLETED",
                "CANCELLED",
                name="stocktransferstatus",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("requested_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("approved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["approved_by_user_id"],
            ["users.id"],
            name=op.f("fk_stock_transfers_approved_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_stock_transfers_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["destination_branch_id"],
            ["branches.id"],
            name=op.f("fk_stock_transfers_destination_branch_id_branches"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_stock_transfers_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"],
            ["users.id"],
            name=op.f("fk_stock_transfers_requested_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_branch_id"],
            ["branches.id"],
            name=op.f("fk_stock_transfers_source_branch_id_branches"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_transfers")),
    )
    for column in ("business_id", "destination_branch_id", "organization_id"):
        op.create_index(
            op.f(f"ix_stock_transfers_{column}"), "stock_transfers", [column]
        )
    op.create_index(
        op.f("ix_stock_transfers_source_branch_id"),
        "stock_transfers",
        ["source_branch_id"],
    )
    op.create_index(op.f("ix_stock_transfers_status"), "stock_transfers", ["status"])
    op.create_index(
        op.f("ix_stock_transfers_transfer_number"),
        "stock_transfers",
        ["transfer_number"],
        unique=True,
    )

    op.create_table(
        "inventory_items",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("name_en", sa.String(length=150), nullable=False),
        sa.Column("name_km", sa.String(length=150), nullable=True),
        sa.Column("sku", sa.String(length=50), nullable=True),
        sa.Column(
            "unit_of_measure",
            sa.Enum(
                "KG",
                "G",
                "LITER",
                "ML",
                "PIECE",
                "CAN",
                "BOTTLE",
                "PACK",
                name="unitofmeasure",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "cost_per_unit_usd", sa.Numeric(precision=12, scale=4), nullable=False
        ),
        sa.Column(
            "reorder_threshold", sa.Numeric(precision=12, scale=2), nullable=False
        ),
        sa.Column(
            "ideal_stock_quantity", sa.Numeric(precision=12, scale=2), nullable=False
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("menu_item_id", sa.Uuid(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_inventory_items_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["menu_item_id"],
            ["menu_items.id"],
            name=op.f("fk_inventory_items_menu_item_id_menu_items"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_inventory_items_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_items")),
    )
    for column in (
        "business_id",
        "is_active",
        "menu_item_id",
        "name_en",
        "organization_id",
        "sku",
    ):
        op.create_index(
            op.f(f"ix_inventory_items_{column}"), "inventory_items", [column]
        )

    op.create_table(
        "branch_stocks",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("inventory_item_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "reorder_threshold", sa.Numeric(precision=12, scale=2), nullable=False
        ),
        sa.Column(
            "ideal_stock_quantity", sa.Numeric(precision=12, scale=2), nullable=False
        ),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_branch_stocks_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_branch_stocks_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["inventory_item_id"],
            ["inventory_items.id"],
            name=op.f("fk_branch_stocks_inventory_item_id_inventory_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_branch_stocks_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_branch_stocks")),
        sa.UniqueConstraint(
            "branch_id", "inventory_item_id", name="uq_branch_inventory_item"
        ),
    )
    for column in ("branch_id", "business_id", "inventory_item_id", "organization_id"):
        op.create_index(op.f(f"ix_branch_stocks_{column}"), "branch_stocks", [column])

    op.create_table(
        "stock_adjustment_logs",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("inventory_item_id", sa.Uuid(), nullable=False),
        sa.Column("quantity_change", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "previous_quantity", sa.Numeric(precision=12, scale=2), nullable=False
        ),
        sa.Column("new_quantity", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "reason",
            sa.Enum(
                "RESTOCK",
                "STOCK_TAKE_AUDIT",
                "SPOILAGE_WASTE",
                "DAMAGED",
                "TRANSFER_OUT",
                "TRANSFER_IN",
                "OTHER",
                name="stockadjustmentreason",
                native_enum=False,
                length=30,
            ),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("adjusted_by_user_id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["adjusted_by_user_id"],
            ["users.id"],
            name=op.f("fk_stock_adjustment_logs_adjusted_by_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_stock_adjustment_logs_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_stock_adjustment_logs_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["inventory_item_id"],
            ["inventory_items.id"],
            name=op.f("fk_stock_adjustment_logs_inventory_item_id_inventory_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_stock_adjustment_logs_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_adjustment_logs")),
    )
    for column in ("branch_id", "business_id", "inventory_item_id", "organization_id"):
        op.create_index(
            op.f(f"ix_stock_adjustment_logs_{column}"),
            "stock_adjustment_logs",
            [column],
        )

    op.create_table(
        "stock_transfer_items",
        sa.Column("transfer_id", sa.Uuid(), nullable=False),
        sa.Column("inventory_item_id", sa.Uuid(), nullable=False),
        sa.Column(
            "requested_quantity", sa.Numeric(precision=12, scale=2), nullable=False
        ),
        sa.Column(
            "shipped_quantity", sa.Numeric(precision=12, scale=2), nullable=False
        ),
        sa.Column(
            "received_quantity", sa.Numeric(precision=12, scale=2), nullable=False
        ),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["inventory_item_id"],
            ["inventory_items.id"],
            name=op.f("fk_stock_transfer_items_inventory_item_id_inventory_items"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["transfer_id"],
            ["stock_transfers.id"],
            name=op.f("fk_stock_transfer_items_transfer_id_stock_transfers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_transfer_items")),
    )
    for column in ("inventory_item_id", "transfer_id"):
        op.create_index(
            op.f(f"ix_stock_transfer_items_{column}"), "stock_transfer_items", [column]
        )

    # Postgres-only drift fixes.
    op.alter_column(
        "menu_items",
        "image_url",
        existing_type=sa.String(length=500),
        type_=sa.String(length=2048),
        existing_nullable=True,
    )
    op.drop_constraint("uq_menu_items_business_sku", "menu_items", type_="unique")
    op.create_index(
        "uq_menu_items_master_sku",
        "menu_items",
        ["business_id", "sku"],
        unique=True,
        postgresql_where=sa.text("branch_id IS NULL"),
        sqlite_where=sa.text("branch_id IS NULL"),
    )
    op.create_index(
        "uq_menu_items_branch_sku",
        "menu_items",
        ["business_id", "branch_id", "sku"],
        unique=True,
        postgresql_where=sa.text("branch_id IS NOT NULL"),
        sqlite_where=sa.text("branch_id IS NOT NULL"),
    )
    op.execute("ALTER TYPE membership_status ADD VALUE IF NOT EXISTS 'archived'")
    for table in ("combo_group_items", "combo_groups"):
        for column in ("business_id", "organization_id"):
            op.create_index(op.f(f"ix_{table}_{column}"), table, [column])
    op.create_index(
        op.f("ix_modifier_options_display_order"),
        "modifier_options",
        ["display_order"],
    )


def downgrade() -> None:
    """Downgrade schema.

    PostgreSQL cannot remove a value from an enum type, so ``archived`` stays in
    ``membership_status``; it is unused by the previous revision and harmless.
    """
    op.drop_index(
        op.f("ix_modifier_options_display_order"), table_name="modifier_options"
    )
    for table in ("combo_group_items", "combo_groups"):
        for column in ("business_id", "organization_id"):
            op.drop_index(op.f(f"ix_{table}_{column}"), table_name=table)
    op.drop_index("uq_menu_items_branch_sku", table_name="menu_items")
    op.drop_index("uq_menu_items_master_sku", table_name="menu_items")
    op.create_unique_constraint(
        "uq_menu_items_business_sku", "menu_items", ["business_id", "sku"]
    )
    op.alter_column(
        "menu_items",
        "image_url",
        existing_type=sa.String(length=2048),
        type_=sa.String(length=500),
        existing_nullable=True,
    )

    op.drop_table("stock_transfer_items")
    op.drop_table("stock_adjustment_logs")
    op.drop_table("branch_stocks")
    op.drop_table("inventory_items")
    op.drop_table("stock_transfers")
