"""add operating_hours to branches

Revision ID: c5d79e1b2a34
Revises: ea8f9af759d6
Create Date: 2026-08-20 16:03:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5d79e1b2a34"
down_revision: str | Sequence[str] | None = "ea8f9af759d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "branches",
        sa.Column("operating_hours", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("branches", "operating_hours")
