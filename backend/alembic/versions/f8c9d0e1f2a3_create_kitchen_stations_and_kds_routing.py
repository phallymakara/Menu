"""create kitchen stations and kds routing

Revision ID: f8c9d0e1f2a3
Revises: f7b8c9d0e1f2
Create Date: 2026-08-21 09:15:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8c9d0e1f2a3"
down_revision: str | Sequence[str] | None = "f7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema to include kitchen stations and KDS timestamps."""
    # 1. Create kitchen_stations table
    op.create_table(
        "kitchen_stations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("name_en", sa.String(length=100), nullable=False),
        sa.Column("name_km", sa.String(length=100), nullable=True),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("station_type", sa.String(length=20), server_default="prep_station", nullable=False),
        sa.Column("color_hex", sa.String(length=10), server_default="#3B82F6", nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_kitchen_stations_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_kitchen_stations_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_kitchen_stations_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kitchen_stations")),
        sa.UniqueConstraint("branch_id", "code", name="uq_branch_kitchen_station_code"),
    )
    op.create_index(op.f("ix_kitchen_stations_organization_id"), "kitchen_stations", ["organization_id"], unique=False)
    op.create_index(op.f("ix_kitchen_stations_business_id"), "kitchen_stations", ["business_id"], unique=False)
    op.create_index(op.f("ix_kitchen_stations_branch_id"), "kitchen_stations", ["branch_id"], unique=False)
    op.create_index(op.f("ix_kitchen_stations_code"), "kitchen_stations", ["code"], unique=False)
    op.create_index(op.f("ix_kitchen_stations_is_active"), "kitchen_stations", ["is_active"], unique=False)

    # 2. Add kitchen_station_id to categories
    op.add_column("categories", sa.Column("kitchen_station_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_categories_kitchen_station_id_kitchen_stations"),
        "categories",
        "kitchen_stations",
        ["kitchen_station_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_categories_kitchen_station_id"), "categories", ["kitchen_station_id"], unique=False)

    # 3. Add kitchen_station_id to menu_items
    op.add_column("menu_items", sa.Column("kitchen_station_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_menu_items_kitchen_station_id_kitchen_stations"),
        "menu_items",
        "kitchen_stations",
        ["kitchen_station_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_menu_items_kitchen_station_id"), "menu_items", ["kitchen_station_id"], unique=False)

    # 4. Add routing and lifecycle timestamps to order_items
    op.add_column("order_items", sa.Column("kitchen_station_id", sa.Uuid(), nullable=True))
    op.add_column("order_items", sa.Column("fired_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("order_items", sa.Column("cooking_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("order_items", sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("order_items", sa.Column("served_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_order_items_kitchen_station_id_kitchen_stations"),
        "order_items",
        "kitchen_stations",
        ["kitchen_station_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_order_items_kitchen_station_id"), "order_items", ["kitchen_station_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("fk_order_items_kitchen_station_id_kitchen_stations"), "order_items", type_="foreignkey")
    op.drop_index(op.f("ix_order_items_kitchen_station_id"), table_name="order_items")
    op.drop_column("order_items", "served_at")
    op.drop_column("order_items", "ready_at")
    op.drop_column("order_items", "cooking_started_at")
    op.drop_column("order_items", "fired_at")
    op.drop_column("order_items", "kitchen_station_id")

    op.drop_constraint(op.f("fk_menu_items_kitchen_station_id_kitchen_stations"), "menu_items", type_="foreignkey")
    op.drop_index(op.f("ix_menu_items_kitchen_station_id"), table_name="menu_items")
    op.drop_column("menu_items", "kitchen_station_id")

    op.drop_constraint(op.f("fk_categories_kitchen_station_id_kitchen_stations"), "categories", type_="foreignkey")
    op.drop_index(op.f("ix_categories_kitchen_station_id"), table_name="categories")
    op.drop_column("categories", "kitchen_station_id")

    op.drop_index(op.f("ix_kitchen_stations_is_active"), table_name="kitchen_stations")
    op.drop_index(op.f("ix_kitchen_stations_code"), table_name="kitchen_stations")
    op.drop_index(op.f("ix_kitchen_stations_branch_id"), table_name="kitchen_stations")
    op.drop_index(op.f("ix_kitchen_stations_business_id"), table_name="kitchen_stations")
    op.drop_index(op.f("ix_kitchen_stations_organization_id"), table_name="kitchen_stations")
    op.drop_table("kitchen_stations")
