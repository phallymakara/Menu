"""create service requests

Guests raise service requests (call staff, water, cleaning, bill, custom) from a
live table session; staff acknowledge and resolve them from the POS service hub.

The request type and status are native PostgreSQL enums. They are created
explicitly before the table and dropped explicitly after it on downgrade.

A partial unique index allows at most one ``open`` request per type and table
session, so concurrent duplicate submissions cannot both succeed.

Revision ID: 08abac32e9a5
Revises: 3cfb7fbc9aad
Create Date: 2026-10-05 23:28:49.741059

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "08abac32e9a5"
down_revision: str | Sequence[str] | None = "3cfb7fbc9aad"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: the types are created and dropped explicitly below, not as a
# side effect of create_table / drop_table.
service_request_type = postgresql.ENUM(
    "call_staff",
    "water",
    "cleaning",
    "bill",
    "custom",
    name="service_request_type",
    create_type=False,
)
service_request_status = postgresql.ENUM(
    "open",
    "acknowledged",
    "resolved",
    "cancelled",
    name="service_request_status",
    create_type=False,
)


def upgrade() -> None:
    """Create the service request enum types, table, and indexes."""
    bind = op.get_bind()
    service_request_type.create(bind, checkfirst=True)
    service_request_status.create(bind, checkfirst=True)

    op.create_table(
        "service_requests",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("table_id", sa.Uuid(), nullable=False),
        sa.Column("table_session_id", sa.Uuid(), nullable=False),
        sa.Column("request_type", service_request_type, nullable=False),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.Column("status", service_request_status, nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_user_id", sa.Uuid(), nullable=True),
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
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_service_requests_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_service_requests_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_service_requests_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["table_id"],
            ["restaurant_tables.id"],
            name=op.f("fk_service_requests_table_id_restaurant_tables"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["table_session_id"],
            ["table_sessions.id"],
            name=op.f("fk_service_requests_table_session_id_table_sessions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["acknowledged_by_user_id"],
            ["users.id"],
            name=op.f("fk_service_requests_acknowledged_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by_user_id"],
            ["users.id"],
            name=op.f("fk_service_requests_resolved_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_requests")),
    )
    for column in ("organization_id", "business_id", "table_id", "table_session_id"):
        op.create_index(
            op.f(f"ix_service_requests_{column}"), "service_requests", [column]
        )
    op.create_index(
        "ix_service_requests_branch_id_status",
        "service_requests",
        ["branch_id", "status"],
    )
    op.create_index(
        "uq_service_requests_open_session_type",
        "service_requests",
        ["table_session_id", "request_type"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
        sqlite_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    """Drop the service request table (with its indexes) and its enum types."""
    op.drop_table("service_requests")

    bind = op.get_bind()
    service_request_status.drop(bind, checkfirst=True)
    service_request_type.drop(bind, checkfirst=True)
