from enum import StrEnum


class UserStatus(StrEnum):
    ACTIVE = "active"
    INVITED = "invited"
    SUSPENDED = "suspended"
    TERMINATED = "terminated"
    ARCHIVED = "archived"


class MembershipStatus(StrEnum):
    ACTIVE = "active"
    INVITED = "invited"
    SUSPENDED = "suspended"
    TERMINATED = "terminated"
    ARCHIVED = "archived"


class OrganizationStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class StaffRole(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    CASHIER = "cashier"
    WAITER = "waiter"
    KITCHEN = "kitchen"
    INVENTORY = "inventory"
    MENU_EDITOR = "menu_editor"
    REPORT_VIEWER = "report_viewer"


class SubscriptionStatus(StrEnum):
    TRIAL = "trial"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    GRACE_PERIOD = "grace_period"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class BillingCycle(StrEnum):
    MONTHLY = "monthly"
    ANNUAL = "annual"
    TRIAL = "trial"


class ItemAvailabilityStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    TEMPORARILY_OUT_OF_STOCK = "TEMPORARILY_OUT_OF_STOCK"
    HIDDEN = "HIDDEN"


class TableShape(StrEnum):
    ROUND = "round"
    RECTANGLE = "rectangle"
    SQUARE = "square"
    BAR_SEAT = "bar_seat"
    BOOTH = "booth"
    OTHER = "other"


class TableStatus(StrEnum):
    AVAILABLE = "available"
    OCCUPIED = "occupied"
    RESERVED = "reserved"
    DIRTY_CLEANING = "dirty_cleaning"
    OUT_OF_SERVICE = "out_of_service"


class TableSessionStatus(StrEnum):
    ACTIVE = "active"
    BILL_REQUESTED = "bill_requested"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    MERGED = "merged"
    TRANSFERRED = "transferred"


class OrderStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    READY_TO_SERVE = "ready_to_serve"
    SERVED = "served"
    CANCELLED = "cancelled"


class OrderItemStatus(StrEnum):
    HELD = "held"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    COOKING = "cooking"
    READY_TO_SERVE = "ready_to_serve"
    SERVED = "served"
    VOIDED = "voided"


class OrderType(StrEnum):
    DINE_IN = "dine_in"
    TAKEAWAY = "takeaway"
    DELIVERY = "delivery"


class OrderSource(StrEnum):
    GUEST_QR = "guest_qr"
    STAFF_POS = "staff_pos"


class CourseStage(StrEnum):
    DRINKS = "drinks"
    STARTERS = "starters"
    MAINS = "mains"
    DESSERTS = "desserts"


class StationType(StrEnum):
    PREP_STATION = "prep_station"
    EXPEDITER = "expediter"


class PaymentMethod(StrEnum):
    CASH = "cash"
    KHQR = "khqr"
    CARD = "card"
    OTHER = "other"


class PaymentStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class ChangeCurrencyPreference(StrEnum):
    KHR = "khr"
    USD = "usd"
    SPLIT = "split"


class VoidReasonCode(StrEnum):
    GUEST_CHANGED_MIND = "guest_changed_mind"
    ORDER_ENTRY_MISTAKE = "order_entry_mistake"
    OUT_OF_STOCK = "out_of_stock"
    QUALITY_ISSUE = "quality_issue"
    LONG_WAIT_TIME = "long_wait_time"
    DUPLICATE_ORDER = "duplicate_order"
    OTHER = "other"


class DiscountType(StrEnum):
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"


class DiscountReason(StrEnum):
    PROMOTION = "promotion"
    VIP_CUSTOMER = "vip_customer"
    STAFF_MEAL = "staff_meal"
    MANAGEMENT_COMP = "management_comp"
    SERVICE_RECOVERY = "service_recovery"
    OTHER = "other"


class UnitOfMeasure(StrEnum):
    KG = "kg"
    G = "g"
    LITER = "liter"
    ML = "ml"
    PIECE = "piece"
    CAN = "can"
    BOTTLE = "bottle"
    PACK = "pack"


class StockTransferStatus(StrEnum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    IN_TRANSIT = "in_transit"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class StockAdjustmentReason(StrEnum):
    RESTOCK = "restock"
    STOCK_TAKE_AUDIT = "stock_take_audit"
    SPOILAGE_WASTE = "spoilage_waste"
    DAMAGED = "damaged"
    TRANSFER_OUT = "transfer_out"
    TRANSFER_IN = "transfer_in"
    OTHER = "other"




