"""create restaurant tables table

Revision ID: c3d4e5f6a8b9
Revises: b2c3d4e5f6a8
Create Date: 2026-08-20 17:26:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a8b9"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "restaurant_tables",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("dining_area_id", sa.Uuid(), nullable=True),
        sa.Column("table_number", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("min_capacity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("max_capacity", sa.Integer(), server_default="4", nullable=False),
        sa.Column(
            "shape", sa.String(length=20), server_default="square", nullable=False
        ),
        sa.Column(
            "status", sa.String(length=20), server_default="available", nullable=False
        ),
        sa.Column("qr_code_token", sa.String(length=64), nullable=True),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
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
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_restaurant_tables_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_restaurant_tables_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["dining_area_id"],
            ["dining_areas.id"],
            name=op.f("fk_restaurant_tables_dining_area_id_dining_areas"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_restaurant_tables_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_restaurant_tables")),
        sa.UniqueConstraint("branch_id", "table_number", name="uq_branch_table_number"),
    )
    op.create_index(
        op.f("ix_restaurant_tables_branch_id"),
        "restaurant_tables",
        ["branch_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_restaurant_tables_business_id"),
        "restaurant_tables",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_restaurant_tables_dining_area_id"),
        "restaurant_tables",
        ["dining_area_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_restaurant_tables_display_order"),
        "restaurant_tables",
        ["display_order"],
        unique=False,
    )
    op.create_index(
        op.f("ix_restaurant_tables_is_active"),
        "restaurant_tables",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        op.f("ix_restaurant_tables_organization_id"),
        "restaurant_tables",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_restaurant_tables_qr_code_token"),
        "restaurant_tables",
        ["qr_code_token"],
        unique=True,
    )
    op.create_index(
        op.f("ix_restaurant_tables_status"),
        "restaurant_tables",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_restaurant_tables_table_number"),
        "restaurant_tables",
        ["table_number"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_restaurant_tables_table_number"), table_name="restaurant_tables"
    )
    op.drop_index(op.f("ix_restaurant_tables_status"), table_name="restaurant_tables")
    op.drop_index(
        op.f("ix_restaurant_tables_qr_code_token"), table_name="restaurant_tables"
    )
    op.drop_index(
        op.f("ix_restaurant_tables_organization_id"), table_name="restaurant_tables"
    )
    op.drop_index(
        op.f("ix_restaurant_tables_is_active"), table_name="restaurant_tables"
    )
    op.drop_index(
        op.f("ix_restaurant_tables_display_order"), table_name="restaurant_tables"
    )
    op.drop_index(
        op.f("ix_restaurant_tables_dining_area_id"), table_name="restaurant_tables"
    )
    op.drop_index(
        op.f("ix_restaurant_tables_business_id"), table_name="restaurant_tables"
    )
    op.drop_index(
        op.f("ix_restaurant_tables_branch_id"), table_name="restaurant_tables"
    )
    op.drop_table("restaurant_tables")
