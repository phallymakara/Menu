"""add avatar_url to users and pos_pin to organization_memberships

Revision ID: l1a2b3c4d5e6
Revises: k1a2b3c4d5e6
Create Date: 2026-08-29 15:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "l1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "k1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add avatar_url to users and pos_pin to organization_memberships."""
    op.add_column(
        "users",
        sa.Column(
            "avatar_url",
            sa.String(500),
            nullable=True,
        ),
    )

    op.add_column(
        "organization_memberships",
        sa.Column(
            "pos_pin",
            sa.String(64),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Drop avatar_url from users and pos_pin from organization_memberships."""
    op.drop_column("organization_memberships", "pos_pin")
    op.drop_column("users", "avatar_url")
