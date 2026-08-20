from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import JSON, Boolean, ForeignKey, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.dining_area import DiningArea
    from app.models.restaurant_table import RestaurantTable


class Branch(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "branches"

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
        String(150),
        nullable=False,
    )

    name_km: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    address: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    timezone: Mapped[str] = mapped_column(
        String(50),
        default="Asia/Phnom_Penh",
        nullable=False,
    )

    default_language: Mapped[str] = mapped_column(
        String(10),
        default="km",
        nullable=False,
    )

    base_currency: Mapped[str] = mapped_column(
        String(3),
        default="USD",
        nullable=False,
    )

    exchange_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        default=None,
        nullable=True,
    )

    tax_percentage: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),
        default=None,
        nullable=True,
    )

    is_tax_inclusive: Mapped[bool | None] = mapped_column(
        Boolean,
        default=None,
        nullable=True,
    )

    service_charge_percentage: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),
        default=None,
        nullable=True,
    )

    is_service_charge_inclusive: Mapped[bool | None] = mapped_column(
        Boolean,
        default=None,
        nullable=True,
    )

    operating_hours: Mapped[dict | list | None] = mapped_column(
        JSON,
        nullable=True,
        default=None,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    business: Mapped[Business] = relationship(
        back_populates="branches",
    )

    dining_areas: Mapped[list[DiningArea]] = relationship(
        back_populates="branch",
        cascade="all, delete-orphan",
        order_by="DiningArea.display_order",
    )

    tables: Mapped[list[RestaurantTable]] = relationship(
        back_populates="branch",
        cascade="all, delete-orphan",
        order_by="RestaurantTable.display_order",
    )
