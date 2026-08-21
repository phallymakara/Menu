from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import PaymentMethod, PaymentStatus

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.order import Order
    from app.models.organization import Organization
    from app.models.promotion import Promotion
    from app.models.table_session import TableSession
    from app.models.user import User



class Payment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payments"

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

    table_session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("table_sessions.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    order_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("orders.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    payment_number: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
        unique=True,
        comment="Sequential transaction identifier (e.g. PAY-20260821-0001)",
    )

    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="payment_method", native_enum=False),
        default=PaymentMethod.CASH,
        nullable=False,
    )

    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status", native_enum=False),
        default=PaymentStatus.COMPLETED,
        nullable=False,
        index=True,
    )

    # Financial breakdown snapshots (USD)
    bill_subtotal_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    discount_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    service_charge_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    tax_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    grand_total_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    # Cambodian Financials snapshot
    exchange_rate: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    grand_total_khr: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    # Cash Tendered & Change Calculations
    amount_tendered_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    amount_tendered_khr: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )

    total_tendered_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    change_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    change_khr: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
    )

    # Discount / Promotion Attribution
    promotion_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("promotions.id", ondelete="SET NULL"),
        nullable=True,
    )

    discount_reason: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # Staff attribution
    received_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    settled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # ORM Relationships
    organization: Mapped[Organization] = relationship("Organization")
    business: Mapped[Business] = relationship("Business")
    branch: Mapped[Branch] = relationship("Branch")
    table_session: Mapped[TableSession | None] = relationship("TableSession")
    order: Mapped[Order | None] = relationship("Order")
    received_by: Mapped[User | None] = relationship("User")
    promotion: Mapped[Promotion | None] = relationship("Promotion")

