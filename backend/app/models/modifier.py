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
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.menu_item import MenuItem
    from app.models.organization import Organization


class ModifierGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "modifier_groups"

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

    name_en: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    name_km: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    description_en: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    description_km: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    min_selections: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    max_selections: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        index=True,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        index=True,
        nullable=False,
    )

    options: Mapped[list[ModifierOption]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="ModifierOption.display_order",
    )

    item_links: Mapped[list[MenuItemModifierGroup]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
    )

    business: Mapped[Business] = relationship()

    organization: Mapped[Organization] = relationship()


class ModifierOption(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "modifier_options"

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

    group_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("modifier_groups.id", ondelete="CASCADE"),
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

    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    is_default: Mapped[bool] = mapped_column(
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

    group: Mapped[ModifierGroup] = relationship(
        back_populates="options",
    )


class MenuItemModifierGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "menu_item_modifier_groups"
    __table_args__ = (
        UniqueConstraint(
            "menu_item_id",
            "modifier_group_id",
            name="uq_item_modifier_group",
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

    modifier_group_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("modifier_groups.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    menu_item: Mapped[MenuItem] = relationship(
        back_populates="modifier_group_links",
    )

    group: Mapped[ModifierGroup] = relationship(
        back_populates="item_links",
    )
