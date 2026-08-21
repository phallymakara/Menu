from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.category import Category
    from app.models.item_variant import ItemVariant
    from app.models.kitchen_station import KitchenStation
    from app.models.modifier import MenuItemModifierGroup
    from app.models.organization import Organization


class MenuItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "menu_items"
    __table_args__ = (
        UniqueConstraint("business_id", "branch_id", "sku", name="uq_menu_items_biz_branch_sku"),
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

    branch_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("branches.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
        comment="If NULL, this is a Central Master Brand Item; if set, this is a local branch item/add-on.",
    )

    category_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("categories.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    sku: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    name_en: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    name_km: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    description_en: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    description_km: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    base_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        default="USD",
        nullable=False,
    )

    image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    gallery_images: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    prep_time_minutes: Mapped[int] = mapped_column(
        Integer,
        default=15,
        nullable=False,
    )

    kitchen_station: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    is_vegetarian: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    is_vegan: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    is_halal: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    is_gluten_free: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    contains_nuts: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    contains_dairy: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    spice_level: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    is_featured: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    is_popular: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    is_new: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        index=True,
        nullable=False,
    )

    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        index=True,
        nullable=False,
    )

    kitchen_station_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("kitchen_stations.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    category: Mapped[Category | None] = relationship(
        back_populates="items",
    )

    station: Mapped[KitchenStation | None] = relationship(
        back_populates="menu_items",
    )

    variants: Mapped[list[ItemVariant]] = relationship(
        back_populates="menu_item",
        cascade="all, delete-orphan",
        order_by="ItemVariant.display_order",
    )

    modifier_group_links: Mapped[list[MenuItemModifierGroup]] = relationship(
        back_populates="menu_item",
        cascade="all, delete-orphan",
        order_by="MenuItemModifierGroup.display_order",
    )

    business: Mapped[Business] = relationship(
        back_populates="items",
    )

    branch: Mapped[Branch | None] = relationship()

    organization: Mapped[Organization] = relationship()
