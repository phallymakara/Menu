from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import BillingCycle, SubscriptionStatus

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.plan import Plan


class Subscription(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "subscriptions"

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )

    plan_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("plans.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(
            SubscriptionStatus,
            name="subscription_status",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        default=SubscriptionStatus.TRIAL,
        index=True,
        nullable=False,
    )

    billing_cycle: Mapped[BillingCycle] = mapped_column(
        Enum(
            BillingCycle,
            name="billing_cycle",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        default=BillingCycle.TRIAL,
        nullable=False,
    )

    trial_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    trial_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    current_period_starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    current_period_ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    organization: Mapped[Organization] = relationship(
        back_populates="subscription",
    )

    plan: Mapped[Plan] = relationship(
        back_populates="subscriptions",
    )
