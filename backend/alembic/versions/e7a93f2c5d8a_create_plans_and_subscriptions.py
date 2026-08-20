"""create plans and subscriptions

Revision ID: e7a93f2c5d8a
Revises: d6e81a2f4c5b
Create Date: 2026-08-20 16:16:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7a93f2c5d8a"
down_revision: str | Sequence[str] | None = "d6e81a2f4c5b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

subscription_status = postgresql.ENUM(
    "trial",
    "active",
    "past_due",
    "grace_period",
    "suspended",
    "cancelled",
    "expired",
    name="subscription_status",
    create_type=False,
)

billing_cycle = postgresql.ENUM(
    "monthly",
    "annual",
    "trial",
    name="billing_cycle",
    create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        subscription_status.create(bind, checkfirst=True)
        billing_cycle.create(bind, checkfirst=True)

    op.create_table(
        "plans",
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column(
            "price_usd_monthly", sa.Numeric(precision=10, scale=2), nullable=False
        ),
        sa.Column(
            "price_usd_annually", sa.Numeric(precision=10, scale=2), nullable=False
        ),
        sa.Column("max_branches", sa.Integer(), nullable=False),
        sa.Column("max_staff", sa.Integer(), nullable=False),
        sa.Column("feature_flags", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_plans")),
    )
    op.create_index(op.f("ix_plans_code"), "plans", ["code"], unique=True)

    op.create_table(
        "subscriptions",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("status", subscription_status, nullable=False),
        sa.Column("billing_cycle", billing_cycle, nullable=False),
        sa.Column("trial_starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "current_period_starts_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column("current_period_ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
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
            name=op.f("fk_subscriptions_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["plans.id"],
            name=op.f("fk_subscriptions_plan_id_plans"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_subscriptions")),
    )
    op.create_index(
        op.f("ix_subscriptions_organization_id"),
        "subscriptions",
        ["organization_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_subscriptions_plan_id"), "subscriptions", ["plan_id"], unique=False
    )
    op.create_index(
        op.f("ix_subscriptions_status"), "subscriptions", ["status"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_subscriptions_status"), table_name="subscriptions")
    op.drop_index(op.f("ix_subscriptions_plan_id"), table_name="subscriptions")
    op.drop_index(op.f("ix_subscriptions_organization_id"), table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_index(op.f("ix_plans_code"), table_name="plans")
    op.drop_table("plans")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        billing_cycle.drop(bind, checkfirst=True)
        subscription_status.drop(bind, checkfirst=True)
