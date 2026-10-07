"""Guest service requests (call staff, water, bill, ...) raised from a table session."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ServiceRequestStatus, ServiceRequestType

if TYPE_CHECKING:
    from app.models.restaurant_table import RestaurantTable
    from app.models.table_session import TableSession
    from app.models.user import User

SERVICE_REQUEST_NOTE_MAX_LENGTH = 200
"""Longest note a guest can attach to a request, in characters."""


class ServiceRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    A guest's call for staff assistance from a live table session.

    A request starts ``open``, becomes ``acknowledged`` when a staff member takes
    it, and ends ``resolved``. ``cancelled`` is reserved for requests withdrawn
    before staff handled them. A session holds at most one ``open`` request per
    type; the partial unique index enforces that even for concurrent submissions.
    """

    __tablename__ = "service_requests"
    __table_args__ = (
        Index("ix_service_requests_branch_id_status", "branch_id", "status"),
        Index(
            "uq_service_requests_open_session_type",
            "table_session_id",
            "request_type",
            unique=True,
            postgresql_where=text("status = 'open'"),
            sqlite_where=text("status = 'open'"),
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

    # Indexed through ix_service_requests_branch_id_status (branch_id leads).
    branch_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
    )

    table_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("restaurant_tables.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    table_session_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("table_sessions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    request_type: Mapped[ServiceRequestType] = mapped_column(
        Enum(
            ServiceRequestType,
            name="service_request_type",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        nullable=False,
    )

    note: Mapped[str | None] = mapped_column(
        String(SERVICE_REQUEST_NOTE_MAX_LENGTH),
        nullable=True,
    )

    status: Mapped[ServiceRequestStatus] = mapped_column(
        Enum(
            ServiceRequestStatus,
            name="service_request_status",
            values_callable=lambda enum: [item.value for item in enum],
        ),
        default=ServiceRequestStatus.OPEN,
        nullable=False,
    )

    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    acknowledged_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    resolved_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    table: Mapped[RestaurantTable] = relationship()

    table_session: Mapped[TableSession] = relationship()

    acknowledged_by_user: Mapped[User | None] = relationship(
        foreign_keys=[acknowledged_by_user_id],
    )

    resolved_by_user: Mapped[User | None] = relationship(
        foreign_keys=[resolved_by_user_id],
    )
