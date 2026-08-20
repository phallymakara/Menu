"""create combos and combo groups tables

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-20 17:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create combos
    op.create_table(
        "combos",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("sku", sa.String(length=50), nullable=True),
        sa.Column("name_en", sa.String(length=150), nullable=False),
        sa.Column("name_km", sa.String(length=150), nullable=True),
        sa.Column("description_en", sa.String(length=500), nullable=True),
        sa.Column("description_km", sa.String(length=500), nullable=True),
        sa.Column(
            "pricing_type", sa.String(length=20), server_default="FIXED", nullable=False
        ),
        sa.Column(
            "base_price",
            sa.Numeric(precision=10, scale=2),
            server_default="0.00",
            nullable=False,
        ),
        sa.Column(
            "discount_percentage",
            sa.Numeric(precision=5, scale=2),
            server_default="0.00",
            nullable=False,
        ),
        sa.Column(
            "currency", sa.String(length=3), server_default="USD", nullable=False
        ),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
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
            name=op.f("fk_combos_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_combos_category_id_categories"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_combos_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_combos")),
    )
    op.create_index(
        op.f("ix_combos_business_id"), "combos", ["business_id"], unique=False
    )
    op.create_index(
        op.f("ix_combos_category_id"), "combos", ["category_id"], unique=False
    )
    op.create_index(
        op.f("ix_combos_display_order"), "combos", ["display_order"], unique=False
    )
    op.create_index(op.f("ix_combos_is_active"), "combos", ["is_active"], unique=False)
    op.create_index(
        op.f("ix_combos_organization_id"), "combos", ["organization_id"], unique=False
    )
    op.create_index(op.f("ix_combos_sku"), "combos", ["sku"], unique=False)

    # 2. Create combo_groups
    op.create_table(
        "combo_groups",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("combo_id", sa.Uuid(), nullable=False),
        sa.Column("name_en", sa.String(length=100), nullable=False),
        sa.Column("name_km", sa.String(length=100), nullable=True),
        sa.Column("min_quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("max_quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
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
            name=op.f("fk_combo_groups_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["combo_id"],
            ["combos.id"],
            name=op.f("fk_combo_groups_combo_id_combos"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_combo_groups_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_combo_groups")),
    )
    op.create_index(
        op.f("ix_combo_groups_combo_id"), "combo_groups", ["combo_id"], unique=False
    )

    # 3. Create combo_group_items
    op.create_table(
        "combo_group_items",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("combo_group_id", sa.Uuid(), nullable=False),
        sa.Column("menu_item_id", sa.Uuid(), nullable=False),
        sa.Column(
            "additional_price",
            sa.Numeric(precision=10, scale=2),
            server_default="0.00",
            nullable=False,
        ),
        sa.Column(
            "is_default", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
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
            name=op.f("fk_combo_group_items_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["combo_group_id"],
            ["combo_groups.id"],
            name=op.f("fk_combo_group_items_combo_group_id_combo_groups"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["menu_item_id"],
            ["menu_items.id"],
            name=op.f("fk_combo_group_items_menu_item_id_menu_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_combo_group_items_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_combo_group_items")),
    )
    op.create_index(
        op.f("ix_combo_group_items_combo_group_id"),
        "combo_group_items",
        ["combo_group_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_combo_group_items_menu_item_id"),
        "combo_group_items",
        ["menu_item_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_combo_group_items_menu_item_id"), table_name="combo_group_items"
    )
    op.drop_index(
        op.f("ix_combo_group_items_combo_group_id"), table_name="combo_group_items"
    )
    op.drop_table("combo_group_items")

    op.drop_index(op.f("ix_combo_groups_combo_id"), table_name="combo_groups")
    op.drop_table("combo_groups")

    op.drop_index(op.f("ix_combos_sku"), table_name="combos")
    op.drop_index(op.f("ix_combos_organization_id"), table_name="combos")
    op.drop_index(op.f("ix_combos_is_active"), table_name="combos")
    op.drop_index(op.f("ix_combos_display_order"), table_name="combos")
    op.drop_index(op.f("ix_combos_category_id"), table_name="combos")
    op.drop_index(op.f("ix_combos_business_id"), table_name="combos")
    op.drop_table("combos")
