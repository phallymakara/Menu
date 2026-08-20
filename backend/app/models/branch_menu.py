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
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.category import Category
    from app.models.menu_item import MenuItem
    from app.models.organization import Organization


class BranchCategoryAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "branch_category_assignments"
    __table_args__ = (
        UniqueConstraint(
            "branch_id",
            "category_id",
            name="uq_branch_category",
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

    branch_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("branches.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    category_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("categories.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    branch: Mapped[Branch] = relationship()
    category: Mapped[Category] = relationship()
    business: Mapped[Business] = relationship()
    organization: Mapped[Organization] = relationship()


class BranchItemOverride(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "branch_item_overrides"
    __table_args__ = (
        UniqueConstraint(
            "branch_id",
            "menu_item_id",
            name="uq_branch_menu_item",
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

    branch_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("branches.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    menu_item_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    price_override: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )

    availability_status: Mapped[str] = mapped_column(
        String(30),
        default="AVAILABLE",
        index=True,
        nullable=False,
    )

    is_featured_override: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    branch: Mapped[Branch] = relationship()
    menu_item: Mapped[MenuItem] = relationship()
    business: Mapped[Business] = relationship()
    organization: Mapped[Organization] = relationship()
