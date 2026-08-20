from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.category import Category
    from app.models.menu_item import MenuItem
    from app.models.organization import Organization


class Combo(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "combos"

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

    pricing_type: Mapped[str] = mapped_column(
        String(20),
        default="FIXED",
        nullable=False,
    )

    base_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    discount_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=Decimal("0.00"),
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

    groups: Mapped[list[ComboGroup]] = relationship(
        back_populates="combo",
        cascade="all, delete-orphan",
        order_by="ComboGroup.display_order",
    )

    category: Mapped[Category | None] = relationship()

    business: Mapped[Business] = relationship()

    organization: Mapped[Organization] = relationship()


class ComboGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "combo_groups"

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

    combo_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("combos.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    name_en: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    name_km: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    min_quantity: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    max_quantity: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    combo: Mapped[Combo] = relationship(
        back_populates="groups",
    )

    items: Mapped[list[ComboGroupItem]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="ComboGroupItem.display_order",
    )


class ComboGroupItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "combo_group_items"

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

    combo_group_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("combo_groups.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    menu_item_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    additional_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    is_default: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    group: Mapped[ComboGroup] = relationship(
        back_populates="items",
    )

    menu_item: Mapped[MenuItem] = relationship()
