"""create table sessions table

Revision ID: d4e5f6a8b9c0
Revises: c3d4e5f6a8b9
Create Date: 2026-08-20 17:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a8b9c0"
down_revision: str | Sequence[str] | None = "c3d4e5f6a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "table_sessions",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("table_id", sa.Uuid(), nullable=False),
        sa.Column("session_code", sa.String(length=30), nullable=False),
        sa.Column("guest_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default="active", nullable=False
        ),
        sa.Column("opened_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "opened_by_type",
            sa.String(length=20),
            server_default="guest",
            nullable=False,
        ),
        sa.Column(
            "opened_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("bill_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.Column("session_token", sa.String(length=64), nullable=True),
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
            name=op.f("fk_table_sessions_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_table_sessions_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["opened_by_user_id"],
            ["users.id"],
            name=op.f("fk_table_sessions_opened_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_table_sessions_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["table_id"],
            ["restaurant_tables.id"],
            name=op.f("fk_table_sessions_table_id_restaurant_tables"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_table_sessions")),
    )
    op.create_index(
        op.f("ix_table_sessions_branch_id"),
        "table_sessions",
        ["branch_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_table_sessions_business_id"),
        "table_sessions",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_table_sessions_opened_by_user_id"),
        "table_sessions",
        ["opened_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_table_sessions_organization_id"),
        "table_sessions",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_table_sessions_session_code"),
        "table_sessions",
        ["session_code"],
        unique=True,
    )
    op.create_index(
        op.f("ix_table_sessions_session_token"),
        "table_sessions",
        ["session_token"],
        unique=False,
    )
    op.create_index(
        op.f("ix_table_sessions_status"), "table_sessions", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_table_sessions_table_id"),
        "table_sessions",
        ["table_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_table_sessions_table_id"), table_name="table_sessions")
    op.drop_index(op.f("ix_table_sessions_status"), table_name="table_sessions")
    op.drop_index(op.f("ix_table_sessions_session_token"), table_name="table_sessions")
    op.drop_index(op.f("ix_table_sessions_session_code"), table_name="table_sessions")
    op.drop_index(
        op.f("ix_table_sessions_organization_id"), table_name="table_sessions"
    )
    op.drop_index(
        op.f("ix_table_sessions_opened_by_user_id"), table_name="table_sessions"
    )
    op.drop_index(op.f("ix_table_sessions_business_id"), table_name="table_sessions")
    op.drop_index(op.f("ix_table_sessions_branch_id"), table_name="table_sessions")
    op.drop_table("table_sessions")
