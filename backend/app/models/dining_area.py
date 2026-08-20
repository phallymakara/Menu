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
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.organization import Organization
    from app.models.restaurant_table import RestaurantTable


class DiningArea(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "dining_areas"

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

    description_en: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    description_km: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    service_charge_percentage: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )

    minimum_spend: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
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

    branch: Mapped[Branch] = relationship(
        back_populates="dining_areas",
    )

    tables: Mapped[list[RestaurantTable]] = relationship(
        back_populates="dining_area",
    )

    business: Mapped[Business] = relationship()

    organization: Mapped[Organization] = relationship()
