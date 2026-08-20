"""create dining areas table

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f6
Create Date: 2026-08-20 17:21:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a8"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "dining_areas",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("name_en", sa.String(length=100), nullable=False),
        sa.Column("name_km", sa.String(length=100), nullable=True),
        sa.Column("description_en", sa.String(length=255), nullable=True),
        sa.Column("description_km", sa.String(length=255), nullable=True),
        sa.Column(
            "service_charge_percentage",
            sa.Numeric(precision=5, scale=2),
            nullable=True,
        ),
        sa.Column("minimum_spend", sa.Numeric(precision=10, scale=2), nullable=True),
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
            name=op.f("fk_dining_areas_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_dining_areas_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_dining_areas_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dining_areas")),
    )
    op.create_index(
        op.f("ix_dining_areas_branch_id"), "dining_areas", ["branch_id"], unique=False
    )
    op.create_index(
        op.f("ix_dining_areas_business_id"),
        "dining_areas",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_dining_areas_display_order"),
        "dining_areas",
        ["display_order"],
        unique=False,
    )
    op.create_index(
        op.f("ix_dining_areas_is_active"), "dining_areas", ["is_active"], unique=False
    )
    op.create_index(
        op.f("ix_dining_areas_organization_id"),
        "dining_areas",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_dining_areas_organization_id"), table_name="dining_areas")
    op.drop_index(op.f("ix_dining_areas_is_active"), table_name="dining_areas")
    op.drop_index(op.f("ix_dining_areas_display_order"), table_name="dining_areas")
    op.drop_index(op.f("ix_dining_areas_business_id"), table_name="dining_areas")
    op.drop_index(op.f("ix_dining_areas_branch_id"), table_name="dining_areas")
    op.drop_table("dining_areas")
