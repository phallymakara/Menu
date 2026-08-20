from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import MembershipStatus, StaffRole

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.organization import Organization
    from app.models.user import User


class OrganizationMembership(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "organization_memberships"

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "user_id",
            name="uq_organization_memberships_organization_user",
        ),
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(
            "organizations.id",
            ondelete="CASCADE",
        ),
        index=True,
        nullable=False,
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
        nullable=False,
    )

    branch_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(
            "branches.id",
            ondelete="SET NULL",
        ),
        index=True,
        nullable=True,
    )

    role: Mapped[StaffRole] = mapped_column(
        Enum(
            StaffRole,
            name="staff_role",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        default=StaffRole.WAITER,
        index=True,
        nullable=False,
    )

    status: Mapped[MembershipStatus] = mapped_column(
        Enum(
            MembershipStatus,
            name="membership_status",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        default=MembershipStatus.ACTIVE,
        index=True,
        nullable=False,
    )

    job_title: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    is_owner: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    invitation_token_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    invitation_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    invited_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    organization: Mapped[Organization] = relationship(
        back_populates="memberships",
    )

    user: Mapped[User] = relationship(
        back_populates="memberships",
        foreign_keys=[user_id],
    )

    branch: Mapped[Branch | None] = relationship()
