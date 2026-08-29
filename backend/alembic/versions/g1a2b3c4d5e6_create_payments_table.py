"""create payments table

Revision ID: g1a2b3c4d5e6
Revises: f8c9d0e1f2a3
Create Date: 2026-08-21 09:48:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "g1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "f8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema to include payments table."""
    op.create_table(
        "payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("table_session_id", sa.Uuid(), nullable=True),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("payment_number", sa.String(length=50), nullable=False),
        sa.Column("payment_method", sa.String(length=20), server_default="cash", nullable=False),
        sa.Column("payment_status", sa.String(length=20), server_default="completed", nullable=False),
        sa.Column("bill_subtotal_usd", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("discount_usd", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("service_charge_usd", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("tax_usd", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("grand_total_usd", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("exchange_rate", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("grand_total_khr", sa.BigInteger(), nullable=False),
        sa.Column("amount_tendered_usd", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("amount_tendered_khr", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("total_tendered_usd", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("change_usd", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("change_khr", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("received_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_payments_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_payments_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_payments_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["table_session_id"],
            ["table_sessions.id"],
            name=op.f("fk_payments_table_session_id_table_sessions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_payments_order_id_orders"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["received_by_user_id"],
            ["users.id"],
            name=op.f("fk_payments_received_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
        sa.UniqueConstraint("payment_number", name=op.f("uq_payments_payment_number")),
    )
    op.create_index(op.f("ix_payments_organization_id"), "payments", ["organization_id"], unique=False)
    op.create_index(op.f("ix_payments_business_id"), "payments", ["business_id"], unique=False)
    op.create_index(op.f("ix_payments_branch_id"), "payments", ["branch_id"], unique=False)
    op.create_index(op.f("ix_payments_table_session_id"), "payments", ["table_session_id"], unique=False)
    op.create_index(op.f("ix_payments_order_id"), "payments", ["order_id"], unique=False)
    op.create_index(op.f("ix_payments_payment_number"), "payments", ["payment_number"], unique=False)
    op.create_index(op.f("ix_payments_payment_status"), "payments", ["payment_status"], unique=False)


def downgrade() -> None:
    """Downgrade schema to drop payments table."""
    op.drop_index(op.f("ix_payments_payment_status"), table_name="payments")
    op.drop_index(op.f("ix_payments_payment_number"), table_name="payments")
    op.drop_index(op.f("ix_payments_order_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_table_session_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_branch_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_business_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_organization_id"), table_name="payments")
    op.drop_table("payments")
