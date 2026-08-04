"""convert organization status to enum

Revision ID: ea8f9af759d6
Revises: b19fcb6aff7f
Create Date: 2026-08-04 15:15:02.722969
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ea8f9af759d6"
down_revision: str | Sequence[str] | None = "b19fcb6aff7f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


organization_status = postgresql.ENUM(
    "active",
    "suspended",
    "archived",
    name="organization_status",
)


def upgrade() -> None:
    """Convert organizations.status from VARCHAR to PostgreSQL enum."""

    organization_status.create(
        op.get_bind(),
        checkfirst=True,
    )

    op.alter_column(
        "organizations",
        "status",
        existing_type=sa.String(length=30),
        type_=organization_status,
        existing_nullable=False,
        postgresql_using="status::organization_status",
    )


def downgrade() -> None:
    """Convert organizations.status back to VARCHAR."""

    op.alter_column(
        "organizations",
        "status",
        existing_type=organization_status,
        type_=sa.String(length=30),
        existing_nullable=False,
        postgresql_using="status::text",
    )

    organization_status.drop(
        op.get_bind(),
        checkfirst=True,
    )
