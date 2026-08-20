"""create menu items table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-20 16:48:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "menu_items",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("sku", sa.String(length=50), nullable=True),
        sa.Column("name_en", sa.String(length=150), nullable=False),
        sa.Column("name_km", sa.String(length=150), nullable=True),
        sa.Column("description_en", sa.String(length=500), nullable=True),
        sa.Column("description_km", sa.String(length=500), nullable=True),
        sa.Column("base_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column(
            "currency", sa.String(length=3), server_default="USD", nullable=False
        ),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("gallery_images", sa.JSON(), nullable=False),
        sa.Column(
            "prep_time_minutes", sa.Integer(), server_default="15", nullable=False
        ),
        sa.Column("kitchen_station", sa.String(length=50), nullable=True),
        sa.Column(
            "is_vegetarian", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column("is_vegan", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("is_halal", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "is_gluten_free", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column(
            "contains_nuts", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column(
            "contains_dairy", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column("spice_level", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "is_featured", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column(
            "is_popular", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column("is_new", sa.Boolean(), server_default=sa.false(), nullable=False),
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
            name=op.f("fk_menu_items_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_menu_items_category_id_categories"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_menu_items_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_menu_items")),
        sa.UniqueConstraint("business_id", "sku", name="uq_menu_items_business_sku"),
    )
    op.create_index(
        op.f("ix_menu_items_business_id"), "menu_items", ["business_id"], unique=False
    )
    op.create_index(
        op.f("ix_menu_items_category_id"), "menu_items", ["category_id"], unique=False
    )
    op.create_index(
        op.f("ix_menu_items_display_order"),
        "menu_items",
        ["display_order"],
        unique=False,
    )
    op.create_index(
        op.f("ix_menu_items_is_active"), "menu_items", ["is_active"], unique=False
    )
    op.create_index(
        op.f("ix_menu_items_kitchen_station"),
        "menu_items",
        ["kitchen_station"],
        unique=False,
    )
    op.create_index(
        op.f("ix_menu_items_organization_id"),
        "menu_items",
        ["organization_id"],
        unique=False,
    )
    op.create_index(op.f("ix_menu_items_sku"), "menu_items", ["sku"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_menu_items_sku"), table_name="menu_items")
    op.drop_index(op.f("ix_menu_items_organization_id"), table_name="menu_items")
    op.drop_index(op.f("ix_menu_items_kitchen_station"), table_name="menu_items")
    op.drop_index(op.f("ix_menu_items_is_active"), table_name="menu_items")
    op.drop_index(op.f("ix_menu_items_display_order"), table_name="menu_items")
    op.drop_index(op.f("ix_menu_items_category_id"), table_name="menu_items")
    op.drop_index(op.f("ix_menu_items_business_id"), table_name="menu_items")
    op.drop_table("menu_items")
