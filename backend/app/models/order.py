from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    CourseStage,
    OrderItemStatus,
    OrderSource,
    OrderStatus,
    OrderType,
)

if TYPE_CHECKING:
    from app.models.branch import Branch
    from app.models.business import Business
    from app.models.item_variant import ItemVariant
    from app.models.kitchen_station import KitchenStation
    from app.models.menu_item import MenuItem
    from app.models.modifier import ModifierOption
    from app.models.organization import Organization
    from app.models.restaurant_table import RestaurantTable
    from app.models.table_session import TableSession
    from app.models.user import User


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"

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

    table_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("restaurant_tables.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    table_session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("table_sessions.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    order_number: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
        comment="Human-readable sequential order identifier (e.g. #101)",
    )

    order_type: Mapped[OrderType] = mapped_column(
        Enum(OrderType, name="order_type", native_enum=False),
        default=OrderType.DINE_IN,
        nullable=False,
    )

    order_source: Mapped[OrderSource] = mapped_column(
        Enum(OrderSource, name="order_source", native_enum=False),
        default=OrderSource.GUEST_QR,
        nullable=False,
    )

    round_number: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        comment="Order round counter within the dining session",
    )

    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status", native_enum=False),
        default=OrderStatus.PENDING,
        index=True,
        nullable=False,
    )

    # Financial breakdown (Base in USD, Secondary in KHR)
    subtotal_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    subtotal_khr: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    tax_rate_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    tax_amount_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    service_charge_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    service_charge_amount_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    total_amount_usd: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    total_amount_khr: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    guest_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    placed_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Staff member who took order (null for guest self-order)",
    )

    cancel_reason_code: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    cancel_reason: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    cancelled_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    organization: Mapped[Organization] = relationship(
        "Organization",
        lazy="selectin",
    )
    business: Mapped[Business] = relationship(
        "Business",
        lazy="selectin",
    )
    branch: Mapped[Branch] = relationship(
        "Branch",
        lazy="selectin",
    )
    table: Mapped[RestaurantTable | None] = relationship(
        "RestaurantTable",
        lazy="selectin",
    )
    table_session: Mapped[TableSession | None] = relationship(
        "TableSession",
        lazy="selectin",
    )
    placed_by_user: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[placed_by_user_id],
        lazy="selectin",
    )
    cancelled_by_user: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[cancelled_by_user_id],
        lazy="selectin",
    )
    items: Mapped[list[OrderItem]] = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="OrderItem.created_at",
    )


class OrderItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("orders.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    menu_item_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("menu_items.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    item_variant_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("item_variants.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Snapshots to preserve receipts integrity
    item_name_en: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    item_name_km: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    variant_name_en: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    variant_name_km: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    base_unit_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Base price + variant adjustments + sum(modifier prices)",
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    subtotal_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        comment="unit_price * quantity",
    )

    course_stage: Mapped[CourseStage] = mapped_column(
        Enum(CourseStage, name="course_stage", native_enum=False),
        default=CourseStage.MAINS,
        nullable=False,
    )

    special_instructions: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    status: Mapped[OrderItemStatus] = mapped_column(
        Enum(OrderItemStatus, name="order_item_status", native_enum=False),
        default=OrderItemStatus.PENDING,
        index=True,
        nullable=False,
    )

    kitchen_station_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("kitchen_stations.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    fired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When the item was fired/released to kitchen for cooking",
    )

    cooking_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When line cook bumped to COOKING",
    )

    ready_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When item was marked READY_TO_SERVE",
    )

    served_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="When item was marked SERVED to table",
    )

    void_reason_code: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    void_reason: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    voided_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    voided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    order: Mapped[Order] = relationship(
        "Order",
        back_populates="items",
    )
    station: Mapped[KitchenStation | None] = relationship(
        "KitchenStation",
        back_populates="order_items",
        lazy="selectin",
    )
    menu_item: Mapped[MenuItem] = relationship(
        "MenuItem",
        lazy="selectin",
    )
    item_variant: Mapped[ItemVariant | None] = relationship(
        "ItemVariant",
        lazy="selectin",
    )
    modifiers: Mapped[list[OrderItemModifier]] = relationship(
        "OrderItemModifier",
        back_populates="order_item",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    voided_by_user: Mapped[User | None] = relationship(
        "User",
        foreign_keys=[voided_by_user_id],
        lazy="selectin",
    )


class OrderItemModifier(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "order_item_modifiers"

    order_item_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("order_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    modifier_option_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("modifier_options.id", ondelete="RESTRICT"),
        nullable=False,
    )

    name_en: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    name_km: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    # Relationships
    order_item: Mapped[OrderItem] = relationship(
        "OrderItem",
        back_populates="modifiers",
    )
    modifier_option: Mapped[ModifierOption] = relationship(
        "ModifierOption",
        lazy="selectin",
    )
