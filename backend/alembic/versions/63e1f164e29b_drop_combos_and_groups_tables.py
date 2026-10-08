"""drop combos and groups tables

Revision ID: 63e1f164e29b
Revises: fc16f8098088
Create Date: 2026-10-07 17:30:26.556848

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63e1f164e29b'
down_revision: Union[str, Sequence[str], None] = 'fc16f8098088'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop combo_group_items, combo_groups, and combos tables."""
    op.drop_index(
        op.f("ix_combo_group_items_menu_item_id"), table_name="combo_group_items"
    )
    op.drop_index(
        op.f("ix_combo_group_items_combo_group_id"), table_name="combo_group_items"
    )
    op.drop_table("combo_group_items")

    op.drop_index(op.f("ix_combo_groups_combo_id"), table_name="combo_groups")
    op.drop_table("combo_groups")

    op.drop_index(op.f("ix_combos_sku"), table_name="combos")
    op.drop_index(op.f("ix_combos_organization_id"), table_name="combos")
    op.drop_index(op.f("ix_combos_is_active"), table_name="combos")
    op.drop_index(op.f("ix_combos_display_order"), table_name="combos")
    op.drop_index(op.f("ix_combos_category_id"), table_name="combos")
    op.drop_index(op.f("ix_combos_business_id"), table_name="combos")
    op.drop_table("combos")


def downgrade() -> None:
    """Recreate combo tables if reverted."""
    pass
