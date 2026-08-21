from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.category import Category
    from app.models.menu_item import MenuItem
    from app.models.organization import Organization


class Business(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "businesses"

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
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

    business_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    logo_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    base_currency: Mapped[str] = mapped_column(
        String(3),
        default="USD",
        nullable=False,
    )

    exchange_rate: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("4100.00"),
        nullable=False,
    )

    tax_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    is_tax_inclusive: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    service_charge_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    is_service_charge_inclusive: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # Bakong KHQR Settings (Default fallback for all branches)
    bakong_account_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="Default Bakong Account ID for business",
    )
    bakong_merchant_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    bakong_merchant_city: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default="Phnom Penh",
    )
    bakong_acquiring_bank: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    # Telegram Bot Settings (Default fallback)
    telegram_bot_token: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    telegram_chat_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    telegram_notifications_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    organization: Mapped[Organization] = relationship(
        back_populates="businesses",
    )

    branches: Mapped[list[Branch]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )

    categories: Mapped[list[Category]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )

    items: Mapped[list[MenuItem]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
