"""add branch_id to menu_items and categories for local branch add-ons

Revision ID: k1a2b3c4d5e6
Revises: j1a2b3c4d5e6
Create Date: 2026-08-21 15:43:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "k1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "j1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add branch_id columns to menu_items and categories."""
    op.add_column(
        "categories",
        sa.Column(
            "branch_id",
            sa.Uuid(),
            sa.ForeignKey("branches.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_categories_branch_id", "categories", ["branch_id"])

    op.add_column(
        "menu_items",
        sa.Column(
            "branch_id",
            sa.Uuid(),
            sa.ForeignKey("branches.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_menu_items_branch_id", "menu_items", ["branch_id"])


def downgrade() -> None:
    """Drop branch_id columns from menu_items and categories."""
    op.drop_index("ix_menu_items_branch_id", table_name="menu_items")
    op.drop_column("menu_items", "branch_id")

    op.drop_index("ix_categories_branch_id", table_name="categories")
    op.drop_column("categories", "branch_id")
