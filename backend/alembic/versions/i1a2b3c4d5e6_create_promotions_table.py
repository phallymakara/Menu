"""create promotions table and link to payments

Revision ID: i1a2b3c4d5e6
Revises: h1a2b3c4d5e6
Create Date: 2026-08-21 10:29:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "i1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "h1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create promotions table and update payments."""
    # 1. Create promotions table
    op.create_table(
        "promotions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=True),
        sa.Column("name_en", sa.String(length=100), nullable=False),
        sa.Column("name_km", sa.String(length=100), nullable=True),
        sa.Column("code", sa.String(length=50), nullable=True),
        sa.Column("discount_type", sa.String(length=20), server_default="percentage", nullable=False),
        sa.Column("discount_value", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("max_discount_amount_usd", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("minimum_spend_usd", sa.Numeric(precision=10, scale=2), server_default="0.00", nullable=False),
        sa.Column("usage_limit", sa.Integer(), nullable=True),
        sa.Column("current_usage_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_promotions_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_promotions_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_promotions_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_promotions")),
    )
    op.create_index(op.f("ix_promotions_organization_id"), "promotions", ["organization_id"], unique=False)
    op.create_index(op.f("ix_promotions_business_id"), "promotions", ["business_id"], unique=False)
    op.create_index(op.f("ix_promotions_branch_id"), "promotions", ["branch_id"], unique=False)
    op.create_index(op.f("ix_promotions_code"), "promotions", ["code"], unique=False)

    # 2. Update payments table
    op.add_column("payments", sa.Column("promotion_id", sa.Uuid(), nullable=True))
    op.add_column("payments", sa.Column("discount_reason", sa.String(length=100), nullable=True))
    op.create_foreign_key(
        op.f("fk_payments_promotion_id_promotions"),
        "payments",
        "promotions",
        ["promotion_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Drop promotions table and remove foreign keys."""
    op.drop_constraint(op.f("fk_payments_promotion_id_promotions"), "payments", type_="foreignkey")
    op.drop_column("payments", "discount_reason")
    op.drop_column("payments", "promotion_id")

    op.drop_index(op.f("ix_promotions_code"), table_name="promotions")
    op.drop_index(op.f("ix_promotions_branch_id"), table_name="promotions")
    op.drop_index(op.f("ix_promotions_business_id"), table_name="promotions")
    op.drop_index(op.f("ix_promotions_organization_id"), table_name="promotions")
    op.drop_table("promotions")
