from __future__ import annotations

import secrets
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.organization import Organization
    from app.models.restaurant_table import RestaurantTable
    from app.models.user import User


def generate_session_token() -> str:
    """Generates a secure 32-character bearer token for table guest session."""
    return secrets.token_urlsafe(24)


class TableSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "table_sessions"

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

    table_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("restaurant_tables.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    session_code: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        index=True,
        nullable=False,
    )

    guest_count: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        index=True,
        nullable=False,
    )

    opened_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    opened_by_type: Mapped[str] = mapped_column(
        String(20),
        default="guest",
        nullable=False,
    )

    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    bill_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    session_token: Mapped[str | None] = mapped_column(
        String(64),
        default=generate_session_token,
        index=True,
        nullable=True,
    )

    parent_session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("table_sessions.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    table: Mapped[RestaurantTable] = relationship(
        back_populates="sessions",
    )

    parent_session: Mapped[TableSession | None] = relationship(
        "TableSession",
        remote_side="TableSession.id",
        back_populates="child_sessions",
    )

    child_sessions: Mapped[list[TableSession]] = relationship(
        "TableSession",
        back_populates="parent_session",
    )

    branch: Mapped[Branch] = relationship()

    business: Mapped[Business] = relationship()

    organization: Mapped[Organization] = relationship()

    opened_by_user: Mapped[User | None] = relationship()
