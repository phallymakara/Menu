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
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    StockAdjustmentReason,
    StockTransferStatus,
    UnitOfMeasure,
)

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.menu_item import MenuItem
    from app.models.organization import Organization
    from app.models.user import User


class InventoryItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "inventory_items"

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

    name_en: Mapped[str] = mapped_column(
        String(150),
        index=True,
        nullable=False,
    )

    name_km: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    sku: Mapped[str | None] = mapped_column(
        String(50),
        index=True,
        nullable=True,
    )

    unit_of_measure: Mapped[UnitOfMeasure] = mapped_column(
        Enum(UnitOfMeasure, native_enum=False, length=20),
        default=UnitOfMeasure.PIECE,
        nullable=False,
    )

    cost_per_unit_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 4),
        default=Decimal("0.0000"),
        nullable=False,
    )

    reorder_threshold: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    ideal_stock_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        index=True,
        nullable=False,
    )

    menu_item_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("menu_items.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    # Relationships
    organization: Mapped[Organization] = relationship()
    business: Mapped[Business] = relationship()
    menu_item: Mapped[MenuItem | None] = relationship(lazy="selectin")
    branch_stocks: Mapped[list[BranchStock]] = relationship(
        back_populates="inventory_item",
        cascade="all, delete-orphan",
    )


class BranchStock(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "branch_stocks"
    __table_args__ = (
        UniqueConstraint(
            "branch_id",
            "inventory_item_id",
            name="uq_branch_inventory_item",
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

    inventory_item_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    reorder_threshold: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    ideal_stock_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    # Relationships
    branch: Mapped[Branch] = relationship(lazy="selectin")
    inventory_item: Mapped[InventoryItem] = relationship(
        back_populates="branch_stocks",
        lazy="selectin",
    )


class StockTransfer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "stock_transfers"

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

    transfer_number: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
    )

    source_branch_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("branches.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    destination_branch_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("branches.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    status: Mapped[StockTransferStatus] = mapped_column(
        Enum(StockTransferStatus, native_enum=False, length=20),
        default=StockTransferStatus.REQUESTED,
        index=True,
        nullable=False,
    )

    requested_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    approved_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    dispatched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    source_branch: Mapped[Branch] = relationship(
        foreign_keys=[source_branch_id],
        lazy="selectin",
    )
    destination_branch: Mapped[Branch] = relationship(
        foreign_keys=[destination_branch_id],
        lazy="selectin",
    )
    requested_by_user: Mapped[User] = relationship(
        foreign_keys=[requested_by_user_id],
        lazy="selectin",
    )
    approved_by_user: Mapped[User | None] = relationship(
        foreign_keys=[approved_by_user_id],
        lazy="selectin",
    )
    items: Mapped[list[StockTransferItem]] = relationship(
        back_populates="transfer",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class StockTransferItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "stock_transfer_items"

    transfer_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("stock_transfers.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    inventory_item_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("inventory_items.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    requested_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    shipped_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    received_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    # Relationships
    transfer: Mapped[StockTransfer] = relationship(back_populates="items")
    inventory_item: Mapped[InventoryItem] = relationship(lazy="selectin")


class StockAdjustmentLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "stock_adjustment_logs"

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

    inventory_item_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    quantity_change: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    previous_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    new_quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    reason: Mapped[StockAdjustmentReason] = mapped_column(
        Enum(StockAdjustmentReason, native_enum=False, length=30),
        default=StockAdjustmentReason.STOCK_TAKE_AUDIT,
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    adjusted_by_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # Relationships
    branch: Mapped[Branch] = relationship(lazy="selectin")
    inventory_item: Mapped[InventoryItem] = relationship(lazy="selectin")
    adjusted_by_user: Mapped[User] = relationship(lazy="selectin")
