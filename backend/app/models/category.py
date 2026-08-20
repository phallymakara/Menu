from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.menu_item import MenuItem
    from app.models.organization import Organization


class Category(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "categories"

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

    parent_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("categories.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
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

    icon: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
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

    parent: Mapped[Category | None] = relationship(
        "Category",
        remote_side="Category.id",
        back_populates="subcategories",
    )

    subcategories: Mapped[list[Category]] = relationship(
        "Category",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="Category.display_order",
    )

    items: Mapped[list[MenuItem]] = relationship(
        back_populates="category",
    )

    business: Mapped[Business] = relationship(
        back_populates="categories",
    )

    organization: Mapped[Organization] = relationship()
