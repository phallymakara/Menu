"""create item variants table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-20 16:54:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "item_variants",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("menu_item_id", sa.Uuid(), nullable=False),
        sa.Column(
            "variant_group", sa.String(length=50), server_default="Size", nullable=False
        ),
        sa.Column("name_en", sa.String(length=100), nullable=False),
        sa.Column("name_km", sa.String(length=100), nullable=True),
        sa.Column("sku", sa.String(length=50), nullable=True),
        sa.Column(
            "price_adjustment",
            sa.Numeric(precision=10, scale=2),
            server_default="0.00",
            nullable=False,
        ),
        sa.Column(
            "is_default", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
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
            name=op.f("fk_item_variants_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["menu_item_id"],
            ["menu_items.id"],
            name=op.f("fk_item_variants_menu_item_id_menu_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_item_variants_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_item_variants")),
    )
    op.create_index(
        op.f("ix_item_variants_business_id"),
        "item_variants",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_item_variants_display_order"),
        "item_variants",
        ["display_order"],
        unique=False,
    )
    op.create_index(
        op.f("ix_item_variants_is_active"),
        "item_variants",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        op.f("ix_item_variants_menu_item_id"),
        "item_variants",
        ["menu_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_item_variants_organization_id"),
        "item_variants",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_item_variants_sku"), "item_variants", ["sku"], unique=False
    )
    op.create_index(
        op.f("ix_item_variants_variant_group"),
        "item_variants",
        ["variant_group"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_item_variants_variant_group"), table_name="item_variants")
    op.drop_index(op.f("ix_item_variants_sku"), table_name="item_variants")
    op.drop_index(op.f("ix_item_variants_organization_id"), table_name="item_variants")
    op.drop_index(op.f("ix_item_variants_menu_item_id"), table_name="item_variants")
    op.drop_index(op.f("ix_item_variants_is_active"), table_name="item_variants")
    op.drop_index(op.f("ix_item_variants_display_order"), table_name="item_variants")
    op.drop_index(op.f("ix_item_variants_business_id"), table_name="item_variants")
    op.drop_table("item_variants")
