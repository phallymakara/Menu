"""create branch menu overrides and category assignments tables

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-08-20 17:12:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create branch_category_assignments
    op.create_table(
        "branch_category_assignments",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
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
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_branch_category_assignments_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_branch_category_assignments_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_branch_category_assignments_category_id_categories"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_branch_category_assignments_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_branch_category_assignments")),
        sa.UniqueConstraint("branch_id", "category_id", name="uq_branch_category"),
    )
    op.create_index(
        op.f("ix_branch_category_assignments_branch_id"),
        "branch_category_assignments",
        ["branch_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_branch_category_assignments_business_id"),
        "branch_category_assignments",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_branch_category_assignments_category_id"),
        "branch_category_assignments",
        ["category_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_branch_category_assignments_organization_id"),
        "branch_category_assignments",
        ["organization_id"],
        unique=False,
    )

    # 2. Create branch_item_overrides
    op.create_table(
        "branch_item_overrides",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("menu_item_id", sa.Uuid(), nullable=False),
        sa.Column("price_override", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column(
            "availability_status",
            sa.String(length=30),
            server_default="AVAILABLE",
            nullable=False,
        ),
        sa.Column("is_featured_override", sa.Boolean(), nullable=True),
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
            name=op.f("fk_branch_item_overrides_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_branch_item_overrides_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["menu_item_id"],
            ["menu_items.id"],
            name=op.f("fk_branch_item_overrides_menu_item_id_menu_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_branch_item_overrides_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_branch_item_overrides")),
        sa.UniqueConstraint("branch_id", "menu_item_id", name="uq_branch_menu_item"),
    )
    op.create_index(
        op.f("ix_branch_item_overrides_availability_status"),
        "branch_item_overrides",
        ["availability_status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_branch_item_overrides_branch_id"),
        "branch_item_overrides",
        ["branch_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_branch_item_overrides_business_id"),
        "branch_item_overrides",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_branch_item_overrides_menu_item_id"),
        "branch_item_overrides",
        ["menu_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_branch_item_overrides_organization_id"),
        "branch_item_overrides",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_branch_item_overrides_organization_id"),
        table_name="branch_item_overrides",
    )
    op.drop_index(
        op.f("ix_branch_item_overrides_menu_item_id"),
        table_name="branch_item_overrides",
    )
    op.drop_index(
        op.f("ix_branch_item_overrides_business_id"), table_name="branch_item_overrides"
    )
    op.drop_index(
        op.f("ix_branch_item_overrides_branch_id"), table_name="branch_item_overrides"
    )
    op.drop_index(
        op.f("ix_branch_item_overrides_availability_status"),
        table_name="branch_item_overrides",
    )
    op.drop_table("branch_item_overrides")

    op.drop_index(
        op.f("ix_branch_category_assignments_organization_id"),
        table_name="branch_category_assignments",
    )
    op.drop_index(
        op.f("ix_branch_category_assignments_category_id"),
        table_name="branch_category_assignments",
    )
    op.drop_index(
        op.f("ix_branch_category_assignments_business_id"),
        table_name="branch_category_assignments",
    )
    op.drop_index(
        op.f("ix_branch_category_assignments_branch_id"),
        table_name="branch_category_assignments",
    )
    op.drop_table("branch_category_assignments")
