"""add void and cancellation tracking to orders and order_items

Revision ID: h1a2b3c4d5e6
Revises: g1a2b3c4d5e6
Create Date: 2026-08-21 10:13:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "h1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "g1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add void and cancellation tracking columns."""
    # 1. Alter orders table
    op.add_column("orders", sa.Column("cancel_reason_code", sa.String(length=50), nullable=True))
    op.add_column("orders", sa.Column("cancel_reason", sa.String(length=255), nullable=True))
    op.add_column("orders", sa.Column("cancelled_by_user_id", sa.Uuid(), nullable=True))
    op.add_column("orders", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_orders_cancelled_by_user_id_users"),
        "orders",
        "users",
        ["cancelled_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 2. Alter order_items table
    op.add_column("order_items", sa.Column("void_reason_code", sa.String(length=50), nullable=True))
    op.add_column("order_items", sa.Column("voided_by_user_id", sa.Uuid(), nullable=True))
    op.add_column("order_items", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_order_items_voided_by_user_id_users"),
        "order_items",
        "users",
        ["voided_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Drop void and cancellation tracking columns."""
    op.drop_constraint(op.f("fk_order_items_voided_by_user_id_users"), "order_items", type_="foreignkey")
    op.drop_column("order_items", "voided_at")
    op.drop_column("order_items", "voided_by_user_id")
    op.drop_column("order_items", "void_reason_code")

    op.drop_constraint(op.f("fk_orders_cancelled_by_user_id_users"), "orders", type_="foreignkey")
    op.drop_column("orders", "cancelled_at")
    op.drop_column("orders", "cancelled_by_user_id")
    op.drop_column("orders", "cancel_reason")
    op.drop_column("orders", "cancel_reason_code")
