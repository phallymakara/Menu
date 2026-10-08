"""allow null business financial defaults

Revision ID: 9c0d1e2f3a4b
Revises: 8b9c0d1e2f3a
Create Date: 2026-10-08 15:45:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9c0d1e2f3a4b"
down_revision: str | Sequence[str] | None = "8b9c0d1e2f3a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Allow businesses financial fields to be null when not configured."""
    op.alter_column("businesses", "exchange_rate", nullable=True, server_default=None)
    op.alter_column("businesses", "tax_percentage", nullable=True, server_default=None)
    op.alter_column("businesses", "service_charge_percentage", nullable=True, server_default=None)
    op.alter_column("businesses", "is_tax_inclusive", nullable=True, server_default=None)
    op.alter_column("businesses", "is_service_charge_inclusive", nullable=True, server_default=None)

    # Clear mock defaults from existing businesses where user never entered data
    op.execute(
        """
        UPDATE businesses
        SET exchange_rate = NULL,
            tax_percentage = NULL,
            service_charge_percentage = NULL,
            is_tax_inclusive = NULL,
            is_service_charge_inclusive = NULL
        WHERE bakong_account_id IS NULL AND bakong_merchant_name IS NULL
        """
    )


def downgrade() -> None:
    """Revert businesses financial fields to default non-null."""
    op.execute(
        """
        UPDATE businesses
        SET exchange_rate = COALESCE(exchange_rate, 4100.00),
            tax_percentage = COALESCE(tax_percentage, 0.00),
            service_charge_percentage = COALESCE(service_charge_percentage, 0.00),
            is_tax_inclusive = COALESCE(is_tax_inclusive, true),
            is_service_charge_inclusive = COALESCE(is_service_charge_inclusive, false)
        """
    )
    op.alter_column("businesses", "exchange_rate", nullable=False, server_default="4100.00")
    op.alter_column("businesses", "tax_percentage", nullable=False, server_default="0.00")
    op.alter_column("businesses", "service_charge_percentage", nullable=False, server_default="0.00")
    op.alter_column("businesses", "is_tax_inclusive", nullable=False, server_default=sa.true())
    op.alter_column("businesses", "is_service_charge_inclusive", nullable=False, server_default=sa.false())
