"""drop menu_item_recipes and stock_transfers tables

Revision ID: 8b9c0d1e2f3a
Revises: 7a8b9c0d1e2f
Create Date: 2026-10-07 22:25:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8b9c0d1e2f3a"
down_revision: str | Sequence[str] | None = "7a8b9c0d1e2f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop recipe and stock transfer tables."""
    # 1. Drop menu_item_recipes
    for idx in (
        "uq_menu_item_recipes_all_variants",
        "uq_menu_item_recipes_variant",
        "ix_menu_item_recipes_business_id",
        "ix_menu_item_recipes_inventory_item_id",
        "ix_menu_item_recipes_menu_item_id",
        "ix_menu_item_recipes_organization_id",
        "ix_menu_item_recipes_variant_id",
    ):
        op.drop_index(idx, table_name="menu_item_recipes", if_exists=True)
    op.drop_table("menu_item_recipes")

    # 2. Drop stock_transfer_items
    for idx in (
        "ix_stock_transfer_items_transfer_id",
        "ix_stock_transfer_items_inventory_item_id",
    ):
        op.drop_index(idx, table_name="stock_transfer_items", if_exists=True)
    op.drop_table("stock_transfer_items")

    # 3. Drop stock_transfers
    for idx in (
        "ix_stock_transfers_organization_id",
        "ix_stock_transfers_business_id",
        "ix_stock_transfers_source_branch_id",
        "ix_stock_transfers_destination_branch_id",
        "ix_stock_transfers_status",
        "ix_stock_transfers_transfer_number",
    ):
        op.drop_index(idx, table_name="stock_transfers", if_exists=True)
    op.drop_table("stock_transfers")


def downgrade() -> None:
    """Downgrade logic not needed for deleted feature."""
    pass
