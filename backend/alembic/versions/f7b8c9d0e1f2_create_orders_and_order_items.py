"""create orders, order items, and order item modifiers

Revision ID: f7b8c9d0e1f2
Revises: e5f6a8b9c0d1
Create Date: 2026-08-20 19:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7b8c9d0e1f2"
down_revision: str | Sequence[str] | None = "e5f6a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "orders",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("table_id", sa.Uuid(), nullable=True),
        sa.Column("table_session_id", sa.Uuid(), nullable=True),
        sa.Column("order_number", sa.String(length=50), nullable=False),
        sa.Column(
            "order_type", sa.String(length=30), nullable=False, server_default="dine_in"
        ),
        sa.Column(
            "order_source",
            sa.String(length=30),
            nullable=False,
            server_default="guest_qr",
        ),
        sa.Column("round_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "status", sa.String(length=30), nullable=False, server_default="pending"
        ),
        sa.Column(
            "subtotal_usd",
            sa.Numeric(precision=12, scale=2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column(
            "subtotal_khr",
            sa.Numeric(precision=14, scale=2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column(
            "tax_rate_percent",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column(
            "tax_amount_usd",
            sa.Numeric(precision=12, scale=2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column(
            "service_charge_percent",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column(
            "service_charge_amount_usd",
            sa.Numeric(precision=12, scale=2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column(
            "total_amount_usd",
            sa.Numeric(precision=12, scale=2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column(
            "total_amount_khr",
            sa.Numeric(precision=14, scale=2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column("guest_notes", sa.Text(), nullable=True),
        sa.Column("placed_by_user_id", sa.Uuid(), nullable=True),
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
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_orders_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_orders_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_orders_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["table_id"],
            ["restaurant_tables.id"],
            name=op.f("fk_orders_table_id_restaurant_tables"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["table_session_id"],
            ["table_sessions.id"],
            name=op.f("fk_orders_table_session_id_table_sessions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["placed_by_user_id"],
            ["users.id"],
            name=op.f("fk_orders_placed_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_orders")),
    )
    op.create_index(
        op.f("ix_orders_organization_id"), "orders", ["organization_id"], unique=False
    )
    op.create_index(
        op.f("ix_orders_business_id"), "orders", ["business_id"], unique=False
    )
    op.create_index(op.f("ix_orders_branch_id"), "orders", ["branch_id"], unique=False)
    op.create_index(op.f("ix_orders_table_id"), "orders", ["table_id"], unique=False)
    op.create_index(
        op.f("ix_orders_table_session_id"), "orders", ["table_session_id"], unique=False
    )
    op.create_index(
        op.f("ix_orders_order_number"), "orders", ["order_number"], unique=False
    )
    op.create_index(op.f("ix_orders_status"), "orders", ["status"], unique=False)

    op.create_table(
        "order_items",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("menu_item_id", sa.Uuid(), nullable=False),
        sa.Column("item_variant_id", sa.Uuid(), nullable=True),
        sa.Column("item_name_en", sa.String(length=150), nullable=False),
        sa.Column("item_name_km", sa.String(length=150), nullable=True),
        sa.Column("variant_name_en", sa.String(length=100), nullable=True),
        sa.Column("variant_name_km", sa.String(length=100), nullable=True),
        sa.Column("base_unit_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("subtotal_price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "course_stage", sa.String(length=30), nullable=False, server_default="mains"
        ),
        sa.Column("special_instructions", sa.String(length=255), nullable=True),
        sa.Column(
            "status", sa.String(length=30), nullable=False, server_default="pending"
        ),
        sa.Column("void_reason", sa.String(length=255), nullable=True),
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
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_items_order_id_orders"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["menu_item_id"],
            ["menu_items.id"],
            name=op.f("fk_order_items_menu_item_id_menu_items"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["item_variant_id"],
            ["item_variants.id"],
            name=op.f("fk_order_items_item_variant_id_item_variants"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_items")),
    )
    op.create_index(
        op.f("ix_order_items_order_id"), "order_items", ["order_id"], unique=False
    )
    op.create_index(
        op.f("ix_order_items_menu_item_id"),
        "order_items",
        ["menu_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_order_items_status"), "order_items", ["status"], unique=False
    )

    op.create_table(
        "order_item_modifiers",
        sa.Column("order_item_id", sa.Uuid(), nullable=False),
        sa.Column("modifier_option_id", sa.Uuid(), nullable=False),
        sa.Column("name_en", sa.String(length=150), nullable=False),
        sa.Column("name_km", sa.String(length=150), nullable=True),
        sa.Column(
            "unit_price",
            sa.Numeric(precision=10, scale=2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
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
            ["order_item_id"],
            ["order_items.id"],
            name=op.f("fk_order_item_modifiers_order_item_id_order_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["modifier_option_id"],
            ["modifier_options.id"],
            name=op.f("fk_order_item_modifiers_modifier_option_id_modifier_options"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_item_modifiers")),
    )
    op.create_index(
        op.f("ix_order_item_modifiers_order_item_id"),
        "order_item_modifiers",
        ["order_item_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("order_item_modifiers")
    op.drop_table("order_items")
    op.drop_table("orders")
