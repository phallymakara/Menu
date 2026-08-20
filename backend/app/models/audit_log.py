from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import JSON, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class AuditLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "audit_logs"

    organization_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )

    user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    action: Mapped[str] = mapped_column(
        String(100),
        index=True,
        nullable=False,
    )

    resource_type: Mapped[str | None] = mapped_column(
        String(50),
        index=True,
        nullable=True,
    )

    resource_id: Mapped[str | None] = mapped_column(
        String(100),
        index=True,
        nullable=True,
    )

    ip_address: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    user_agent: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    details: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )

    organization: Mapped[Organization | None] = relationship()
    user: Mapped[User | None] = relationship()
