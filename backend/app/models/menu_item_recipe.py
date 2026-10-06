"""Recipe (bill of materials) lines linking menu items to inventory usage."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Numeric, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.inventory import InventoryItem
    from app.models.item_variant import ItemVariant


class MenuItemRecipe(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    One ingredient line of a menu item's recipe (bill of materials).

    ``quantity`` is the amount of the inventory item consumed to make one unit of
    the menu item, expressed in the inventory item's own unit of measure; there is
    no unit conversion. A line whose ``variant_id`` is NULL applies to every
    variant. A variant-specific line for the same inventory item overrides it for
    that variant.
    """

    __tablename__ = "menu_item_recipes"
    # One line per (menu item, variant, inventory item). Partial indexes keep this
    # NULL-safe: a plain unique constraint would treat every all-variants line
    # (variant_id NULL) as distinct and allow duplicates.
    __table_args__ = (
        Index(
            "uq_menu_item_recipes_all_variants",
            "menu_item_id",
            "inventory_item_id",
            unique=True,
            postgresql_where=text("variant_id IS NULL"),
            sqlite_where=text("variant_id IS NULL"),
        ),
        Index(
            "uq_menu_item_recipes_variant",
            "menu_item_id",
            "variant_id",
            "inventory_item_id",
            unique=True,
            postgresql_where=text("variant_id IS NOT NULL"),
            sqlite_where=text("variant_id IS NOT NULL"),
        ),
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    business_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("businesses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    menu_item_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    variant_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("item_variants.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )

    inventory_item_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    # Relationships
    inventory_item: Mapped[InventoryItem] = relationship(lazy="selectin")
    variant: Mapped[ItemVariant | None] = relationship(lazy="selectin")
