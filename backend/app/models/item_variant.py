from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.menu_item import MenuItem
    from app.models.organization import Organization


class ItemVariant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "item_variants"

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

    variant_group: Mapped[str] = mapped_column(
        String(50),
        default="Size",
        nullable=False,
        index=True,
    )

    name_en: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    name_km: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    sku: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    price_adjustment: Mapped[Decimal] = mapped_column(
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

    menu_item: Mapped[MenuItem] = relationship(
        back_populates="variants",
    )

    business: Mapped[Business] = relationship()

    organization: Mapped[Organization] = relationship()
