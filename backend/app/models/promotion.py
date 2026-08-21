from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import DiscountType

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.organization import Organization


class Promotion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "promotions"

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
        comment="If null, promotion is valid across all branches of the business",
    )

    name_en: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    name_km: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    code: Mapped[str | None] = mapped_column(
        String(50),
        index=True,
        nullable=True,
        comment="Alphanumeric coupon code (e.g. WELCOME15)",
    )

    discount_type: Mapped[DiscountType] = mapped_column(
        Enum(DiscountType, name="discount_type", native_enum=False),
        default=DiscountType.PERCENTAGE,
        nullable=False,
    )

    discount_value: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Percentage value (e.g. 15.00) or fixed amount (e.g. 5.00)",
    )

    max_discount_amount_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        comment="Maximum dollar cap for percentage discounts",
    )

    minimum_spend_usd: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
        comment="Minimum order subtotal required to qualify",
    )

    usage_limit: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Total allowable redemptions (null for unlimited)",
    )

    current_usage_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # Relationships
    organization: Mapped[Organization] = relationship("Organization")
    business: Mapped[Business] = relationship("Business")
    branch: Mapped[Branch | None] = relationship("Branch")
