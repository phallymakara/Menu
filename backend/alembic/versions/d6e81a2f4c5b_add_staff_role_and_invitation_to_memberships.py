"""add staff role and invitation to memberships

Revision ID: d6e81a2f4c5b
Revises: c5d79e1b2a34
Create Date: 2026-08-20 16:08:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6e81a2f4c5b"
down_revision: str | Sequence[str] | None = "c5d79e1b2a34"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

staff_role = postgresql.ENUM(
    "owner",
    "manager",
    "cashier",
    "waiter",
    "kitchen",
    "inventory",
    "menu_editor",
    "report_viewer",
    name="staff_role",
    create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        staff_role.create(bind, checkfirst=True)

    op.add_column(
        "organization_memberships",
        sa.Column(
            "branch_id",
            sa.Uuid(),
            nullable=True,
        ),
    )
    op.add_column(
        "organization_memberships",
        sa.Column(
            "role",
            staff_role,
            nullable=False,
            server_default="waiter",
        ),
    )
    op.add_column(
        "organization_memberships",
        sa.Column(
            "invitation_token_hash",
            sa.String(length=255),
            nullable=True,
        ),
    )
    op.add_column(
        "organization_memberships",
        sa.Column(
            "invitation_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "organization_memberships",
        sa.Column(
            "invited_by_user_id",
            sa.Uuid(),
            nullable=True,
        ),
    )
    op.create_index(
        op.f("ix_organization_memberships_branch_id"),
        "organization_memberships",
        ["branch_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organization_memberships_role"),
        "organization_memberships",
        ["role"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_organization_memberships_branch_id_branches"),
        "organization_memberships",
        "branches",
        ["branch_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_organization_memberships_invited_by_user_id_users"),
        "organization_memberships",
        "users",
        ["invited_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f("fk_organization_memberships_invited_by_user_id_users"),
        "organization_memberships",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_organization_memberships_branch_id_branches"),
        "organization_memberships",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_organization_memberships_role"),
        table_name="organization_memberships",
    )
    op.drop_index(
        op.f("ix_organization_memberships_branch_id"),
        table_name="organization_memberships",
    )
    op.drop_column("organization_memberships", "invited_by_user_id")
    op.drop_column("organization_memberships", "invitation_expires_at")
    op.drop_column("organization_memberships", "invitation_token_hash")
    op.drop_column("organization_memberships", "role")
    op.drop_column("organization_memberships", "branch_id")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        staff_role.drop(bind, checkfirst=True)
