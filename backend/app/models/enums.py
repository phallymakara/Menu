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
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
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
