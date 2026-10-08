"""add pos_permissions to organization_memberships

Revision ID: m1a2b3c4d5e6
Revises: 9c0d1e2f3a4b
Create Date: 2026-10-08 17:15:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "m1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "9c0d1e2f3a4b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add pos_permissions JSON column to organization_memberships."""
    op.add_column(
        "organization_memberships",
        sa.Column(
            "pos_permissions",
            sa.JSON(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Drop pos_permissions from organization_memberships."""
    op.drop_column("organization_memberships", "pos_permissions")
