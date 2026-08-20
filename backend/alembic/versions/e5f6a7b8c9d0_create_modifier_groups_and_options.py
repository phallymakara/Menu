"""create modifier groups and options tables

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-20 16:59:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create modifier_groups
    op.create_table(
        "modifier_groups",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("name_en", sa.String(length=100), nullable=False),
        sa.Column("name_km", sa.String(length=100), nullable=True),
        sa.Column("description_en", sa.String(length=255), nullable=True),
        sa.Column("description_km", sa.String(length=255), nullable=True),
        sa.Column("min_selections", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_selections", sa.Integer(), server_default="1", nullable=False),
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
            name=op.f("fk_modifier_groups_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_modifier_groups_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_modifier_groups")),
    )
    op.create_index(
        op.f("ix_modifier_groups_business_id"),
        "modifier_groups",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_modifier_groups_display_order"),
        "modifier_groups",
        ["display_order"],
        unique=False,
    )
    op.create_index(
        op.f("ix_modifier_groups_is_active"),
        "modifier_groups",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        op.f("ix_modifier_groups_organization_id"),
        "modifier_groups",
        ["organization_id"],
        unique=False,
    )

    # 2. Create modifier_options
    op.create_table(
        "modifier_options",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("group_id", sa.Uuid(), nullable=False),
        sa.Column("name_en", sa.String(length=100), nullable=False),
        sa.Column("name_km", sa.String(length=100), nullable=True),
        sa.Column(
            "price",
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
            name=op.f("fk_modifier_options_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["modifier_groups.id"],
            name=op.f("fk_modifier_options_group_id_modifier_groups"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_modifier_options_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_modifier_options")),
    )
    op.create_index(
        op.f("ix_modifier_options_business_id"),
        "modifier_options",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_modifier_options_group_id"),
        "modifier_options",
        ["group_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_modifier_options_is_active"),
        "modifier_options",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        op.f("ix_modifier_options_organization_id"),
        "modifier_options",
        ["organization_id"],
        unique=False,
    )

    # 3. Create menu_item_modifier_groups
    op.create_table(
        "menu_item_modifier_groups",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("menu_item_id", sa.Uuid(), nullable=False),
        sa.Column("modifier_group_id", sa.Uuid(), nullable=False),
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
            name=op.f("fk_menu_item_modifier_groups_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["menu_item_id"],
            ["menu_items.id"],
            name=op.f("fk_menu_item_modifier_groups_menu_item_id_menu_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["modifier_group_id"],
            ["modifier_groups.id"],
            name=op.f("fk_menu_item_modifier_groups_modifier_group_id_modifier_groups"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_menu_item_modifier_groups_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_menu_item_modifier_groups")),
        sa.UniqueConstraint(
            "menu_item_id", "modifier_group_id", name="uq_item_modifier_group"
        ),
    )
    op.create_index(
        op.f("ix_menu_item_modifier_groups_business_id"),
        "menu_item_modifier_groups",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_menu_item_modifier_groups_menu_item_id"),
        "menu_item_modifier_groups",
        ["menu_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_menu_item_modifier_groups_modifier_group_id"),
        "menu_item_modifier_groups",
        ["modifier_group_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_menu_item_modifier_groups_organization_id"),
        "menu_item_modifier_groups",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_menu_item_modifier_groups_organization_id"),
        table_name="menu_item_modifier_groups",
    )
    op.drop_index(
        op.f("ix_menu_item_modifier_groups_modifier_group_id"),
        table_name="menu_item_modifier_groups",
    )
    op.drop_index(
        op.f("ix_menu_item_modifier_groups_menu_item_id"),
        table_name="menu_item_modifier_groups",
    )
    op.drop_index(
        op.f("ix_menu_item_modifier_groups_business_id"),
        table_name="menu_item_modifier_groups",
    )
    op.drop_table("menu_item_modifier_groups")

    op.drop_index(
        op.f("ix_modifier_options_organization_id"), table_name="modifier_options"
    )
    op.drop_index(op.f("ix_modifier_options_is_active"), table_name="modifier_options")
    op.drop_index(op.f("ix_modifier_options_group_id"), table_name="modifier_options")
    op.drop_index(
        op.f("ix_modifier_options_business_id"), table_name="modifier_options"
    )
    op.drop_table("modifier_options")

    op.drop_index(
        op.f("ix_modifier_groups_organization_id"), table_name="modifier_groups"
    )
    op.drop_index(op.f("ix_modifier_groups_is_active"), table_name="modifier_groups")
    op.drop_index(
        op.f("ix_modifier_groups_display_order"), table_name="modifier_groups"
    )
    op.drop_index(op.f("ix_modifier_groups_business_id"), table_name="modifier_groups")
    op.drop_table("modifier_groups")
