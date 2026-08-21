from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import StationType

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.category import Category
    from app.models.menu_item import MenuItem
    from app.models.order import OrderItem
    from app.models.organization import Organization


class KitchenStation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "kitchen_stations"
    __table_args__ = (
        UniqueConstraint(
            "branch_id",
            "code",
            name="uq_branch_kitchen_station_code",
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

    name_en: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    name_km: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    code: Mapped[str] = mapped_column(
        String(30),
        index=True,
        nullable=False,
    )

    station_type: Mapped[StationType] = mapped_column(
        Enum(StationType, native_enum=False, length=20),
        default=StationType.PREP_STATION,
        nullable=False,
    )

    color_hex: Mapped[str] = mapped_column(
        String(10),
        default="#3B82F6",
        nullable=False,
    )

    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        index=True,
        nullable=False,
    )

    # Relationships
    branch: Mapped[Branch] = relationship()
    business: Mapped[Business] = relationship()
    organization: Mapped[Organization] = relationship()

    categories: Mapped[list[Category]] = relationship(
        back_populates="station",
    )
    menu_items: Mapped[list[MenuItem]] = relationship(
        back_populates="station",
    )
    order_items: Mapped[list[OrderItem]] = relationship(
        back_populates="station",
    )
