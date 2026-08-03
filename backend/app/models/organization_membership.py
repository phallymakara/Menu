from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Enum,
    ForeignKey,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import MembershipStatus

if TYPE_CHECKING:
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

    organization: Mapped[Organization] = relationship(
        back_populates="memberships",
    )

    user: Mapped[User] = relationship(
        back_populates="memberships",
    )
