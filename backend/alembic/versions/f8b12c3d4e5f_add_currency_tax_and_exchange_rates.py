"""add currency tax and exchange rates to businesses and branches

Revision ID: f8b12c3d4e5f
Revises: e7a93f2c5d8a
Create Date: 2026-08-20 16:25:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8b12c3d4e5f"
down_revision: str | Sequence[str] | None = "e7a93f2c5d8a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add columns to businesses
    op.add_column(
        "businesses",
        sa.Column(
            "base_currency", sa.String(length=3), server_default="USD", nullable=False
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "exchange_rate",
            sa.Numeric(precision=10, scale=2),
            server_default="4100.00",
            nullable=False,
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "tax_percentage",
            sa.Numeric(precision=5, scale=2),
            server_default="0.00",
            nullable=False,
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "is_tax_inclusive", sa.Boolean(), server_default=sa.true(), nullable=False
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "service_charge_percentage",
            sa.Numeric(precision=5, scale=2),
            server_default="0.00",
            nullable=False,
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "is_service_charge_inclusive",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )

    # Add columns to branches
    op.add_column(
        "branches",
        sa.Column("exchange_rate", sa.Numeric(precision=10, scale=2), nullable=True),
    )
    op.add_column(
        "branches",
        sa.Column("tax_percentage", sa.Numeric(precision=5, scale=2), nullable=True),
    )
    op.add_column(
        "branches",
        sa.Column("is_tax_inclusive", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "branches",
        sa.Column(
            "service_charge_percentage",
            sa.Numeric(precision=5, scale=2),
            nullable=True,
        ),
    )
    op.add_column(
        "branches",
        sa.Column("is_service_charge_inclusive", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("branches", "is_service_charge_inclusive")
    op.drop_column("branches", "service_charge_percentage")
    op.drop_column("branches", "is_tax_inclusive")
    op.drop_column("branches", "tax_percentage")
    op.drop_column("branches", "exchange_rate")

    op.drop_column("businesses", "is_service_charge_inclusive")
    op.drop_column("businesses", "service_charge_percentage")
    op.drop_column("businesses", "is_tax_inclusive")
    op.drop_column("businesses", "tax_percentage")
    op.drop_column("businesses", "exchange_rate")
    op.drop_column("businesses", "base_currency")
