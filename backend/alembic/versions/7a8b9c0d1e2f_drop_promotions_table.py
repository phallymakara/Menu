"""drop promotions table and remove promotion_id from payments

Revision ID: 7a8b9c0d1e2f
Revises: 63e1f164e29b
Create Date: 2026-10-07 21:58:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7a8b9c0d1e2f"
down_revision: str | Sequence[str] | None = "63e1f164e29b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop promotions table and remove promotion_id from payments."""
    # 1. Drop foreign key constraint on payments
    try:
        op.drop_constraint(
            op.f("fk_payments_promotion_id_promotions"),
            "payments",
            type_="foreignkey",
        )
    except Exception:
        pass

    # 2. Drop promotion_id column from payments
    try:
        op.drop_column("payments", "promotion_id")
    except Exception:
        pass

    # 3. Drop indexes on promotions
    op.drop_index(op.f("ix_promotions_code"), table_name="promotions", if_exists=True)
    op.drop_index(
        op.f("ix_promotions_branch_id"), table_name="promotions", if_exists=True
    )
    op.drop_index(
        op.f("ix_promotions_business_id"), table_name="promotions", if_exists=True
    )
    op.drop_index(
        op.f("ix_promotions_organization_id"), table_name="promotions", if_exists=True
    )

    # 4. Drop promotions table
    op.drop_table("promotions")


def downgrade() -> None:
    """Downgrade logic not needed for deleted feature."""
    pass
