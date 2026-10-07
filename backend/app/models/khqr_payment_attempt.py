"""
KHQR payment attempt model.

Every dynamic KHQR handed to a customer is recorded as one attempt, so that the
payment can later be confirmed with Bakong by the MD5 of the exact KHQR string.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import KHQRPaymentAttemptStatus


class KHQRPaymentAttempt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    One dynamic KHQR generated for a table session bill or a single order.

    The attempt stores the amount and currency the QR charges, the full KHQR
    payload, and its MD5 (lowercase hex of the UTF-8 KHQR string), which is the
    key Bakong uses in ``check_transaction_by_md5``. Exactly one of
    ``table_session_id`` and ``order_id`` is set when the attempt is created.
    """

    __tablename__ = "khqr_payment_attempts"

    __table_args__ = (
        CheckConstraint(
            "table_session_id IS NULL OR order_id IS NULL",
            name="single_target",
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

    amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        comment="Amount encoded in the KHQR, in the attempt currency",
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        comment="ISO 4217 alpha code of the KHQR amount (USD or KHR)",
    )

    qr_payload: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Full EMVCo KHQR string shown to the customer",
    )

    md5: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        comment="Lowercase hex MD5 of the KHQR string, as Bakong indexes it",
    )

    status: Mapped[KHQRPaymentAttemptStatus] = mapped_column(
        Enum(
            KHQRPaymentAttemptStatus,
            name="khqr_payment_attempt_status",
            native_enum=False,
            length=20,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        default=KHQRPaymentAttemptStatus.PENDING,
        index=True,
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    bakong_reference: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
        comment="Bakong transaction hash reported for this KHQR",
    )

    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When Bakong confirmed that the payment was received",
    )

    failure_reason: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    payment_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("payments.id", ondelete="SET NULL"),
        unique=True,
        nullable=True,
        comment="Payment created when this attempt settled the bill",
    )

    created_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
