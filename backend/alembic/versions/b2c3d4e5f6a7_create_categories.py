"""create categories table

Revision ID: b2c3d4e5f6a7
Revises: a9b2c3d4e5f6
Create Date: 2026-08-20 16:42:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a9b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "categories",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("name_en", sa.String(length=150), nullable=False),
        sa.Column("name_km", sa.String(length=150), nullable=True),
        sa.Column("description_en", sa.String(length=500), nullable=True),
        sa.Column("description_km", sa.String(length=500), nullable=True),
        sa.Column("icon", sa.String(length=100), nullable=True),
        sa.Column("image_url", sa.String(length=500), nullable=True),
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
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_categories_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_categories_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["categories.id"],
            name=op.f("fk_categories_parent_id_categories"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
    )
    op.create_index(
        op.f("ix_categories_business_id"), "categories", ["business_id"], unique=False
    )
    op.create_index(
        op.f("ix_categories_display_order"),
        "categories",
        ["display_order"],
        unique=False,
    )
    op.create_index(
        op.f("ix_categories_is_active"), "categories", ["is_active"], unique=False
    )
    op.create_index(
        op.f("ix_categories_organization_id"),
        "categories",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_categories_parent_id"), "categories", ["parent_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_categories_parent_id"), table_name="categories")
    op.drop_index(op.f("ix_categories_organization_id"), table_name="categories")
    op.drop_index(op.f("ix_categories_is_active"), table_name="categories")
    op.drop_index(op.f("ix_categories_display_order"), table_name="categories")
    op.drop_index(op.f("ix_categories_business_id"), table_name="categories")
    op.drop_table("categories")
