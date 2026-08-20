"""add table merging and transfers

Revision ID: e5f6a8b9c0d1
Revises: d4e5f6a8b9c0
Create Date: 2026-08-20 17:46:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a8b9c0d1"
down_revision: str | Sequence[str] | None = "d4e5f6a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "table_sessions",
        sa.Column("parent_session_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f("ix_table_sessions_parent_session_id"),
        "table_sessions",
        ["parent_session_id"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_table_sessions_parent_session_id_table_sessions"),
        "table_sessions",
        "table_sessions",
        ["parent_session_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f("fk_table_sessions_parent_session_id_table_sessions"),
        "table_sessions",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_table_sessions_parent_session_id"), table_name="table_sessions"
    )
    op.drop_column("table_sessions", "parent_session_id")
