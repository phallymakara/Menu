"""add bakong and telegram settings to businesses and branches

Revision ID: j1a2b3c4d5e6
Revises: i1a2b3c4d5e6
Create Date: 2026-08-21 13:44:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "j1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "i1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add Bakong and Telegram configuration columns."""
    # 1. Update businesses table
    op.add_column("businesses", sa.Column("bakong_account_id", sa.String(length=100), nullable=True))
    op.add_column("businesses", sa.Column("bakong_merchant_name", sa.String(length=100), nullable=True))
    op.add_column("businesses", sa.Column("bakong_merchant_city", sa.String(length=50), server_default="Phnom Penh", nullable=True))
    op.add_column("businesses", sa.Column("bakong_acquiring_bank", sa.String(length=50), nullable=True))
    op.add_column("businesses", sa.Column("telegram_bot_token", sa.String(length=255), nullable=True))
    op.add_column("businesses", sa.Column("telegram_chat_id", sa.String(length=100), nullable=True))
    op.add_column("businesses", sa.Column("telegram_notifications_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False))

    # 2. Update branches table
    op.add_column("branches", sa.Column("bakong_account_id", sa.String(length=100), nullable=True))
    op.add_column("branches", sa.Column("bakong_merchant_name", sa.String(length=100), nullable=True))
    op.add_column("branches", sa.Column("bakong_merchant_city", sa.String(length=50), server_default="Phnom Penh", nullable=True))
    op.add_column("branches", sa.Column("bakong_acquiring_bank", sa.String(length=50), nullable=True))
    op.add_column("branches", sa.Column("telegram_bot_token", sa.String(length=255), nullable=True))
    op.add_column("branches", sa.Column("telegram_chat_id", sa.String(length=100), nullable=True))
    op.add_column("branches", sa.Column("telegram_notifications_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False))


def downgrade() -> None:
    """Drop Bakong and Telegram configuration columns."""
    op.drop_column("branches", "telegram_notifications_enabled")
    op.drop_column("branches", "telegram_chat_id")
    op.drop_column("branches", "telegram_bot_token")
    op.drop_column("branches", "bakong_acquiring_bank")
    op.drop_column("branches", "bakong_merchant_city")
    op.drop_column("branches", "bakong_merchant_name")
    op.drop_column("branches", "bakong_account_id")

    op.drop_column("businesses", "telegram_notifications_enabled")
    op.drop_column("businesses", "telegram_chat_id")
    op.drop_column("businesses", "telegram_bot_token")
    op.drop_column("businesses", "bakong_acquiring_bank")
    op.drop_column("businesses", "bakong_merchant_city")
    op.drop_column("businesses", "bakong_merchant_name")
    op.drop_column("businesses", "bakong_account_id")
