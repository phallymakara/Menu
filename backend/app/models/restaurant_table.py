from __future__ import annotations

import secrets
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.dining_area import DiningArea
    from app.models.organization import Organization
    from app.models.table_session import TableSession


def generate_qr_token() -> str:
    """Generates a secure URL-safe cryptographic token for table QR codes."""
    return secrets.token_urlsafe(24)


class RestaurantTable(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "restaurant_tables"
    __table_args__ = (
        UniqueConstraint(
            "branch_id",
            "table_number",
            name="uq_branch_table_number",
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

    dining_area_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("dining_areas.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    table_number: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )

    name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    min_capacity: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    max_capacity: Mapped[int] = mapped_column(
        Integer,
        default=4,
        nullable=False,
    )

    shape: Mapped[str] = mapped_column(
        String(20),
        default="square",
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="available",
        index=True,
        nullable=False,
    )

    qr_code_token: Mapped[str | None] = mapped_column(
        String(64),
        default=generate_qr_token,
        unique=True,
        index=True,
        nullable=True,
    )

    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        index=True,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        index=True,
        nullable=False,
    )

    branch: Mapped[Branch] = relationship(
        back_populates="tables",
    )

    dining_area: Mapped[DiningArea | None] = relationship(
        back_populates="tables",
    )

    sessions: Mapped[list[TableSession]] = relationship(
        back_populates="table",
        cascade="all, delete-orphan",
        order_by="TableSession.created_at.desc()",
    )

    business: Mapped[Business] = relationship()

    organization: Mapped[Organization] = relationship()
