"""Role-based access control for staff routes.

Every active member of an organization may read its catalog, floor plan, and
operational data. Changing data requires a permission, and each staff role grants a
fixed set of permissions (``ROLE_PERMISSIONS``), following the role definitions in
the product proposal. Owners hold every permission.

Routers attach a check either to all their routes::

    router = APIRouter(
        prefix="...",
        dependencies=[Depends(require_permission_for_writes(Permission.MANAGE_MENU))],
    )

or to a single route with ``dependencies=[Depends(require_permission(...))]``.
"""

from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, status

from app.api.dependencies.tenant import get_current_tenant_context
from app.core.tenant import TenantContext
from app.models.enums import StaffRole
from app.models.organization_membership import OrganizationMembership

logger = structlog.get_logger("app.api.dependencies.permissions")

_READ_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class Permission(StrEnum):
    """Actions that change organization data, granted to roles below."""

    MANAGE_BUSINESS = "manage_business"
    """Business profile, tax, currency, and other business-wide settings."""
    MANAGE_BRANCHES = "manage_branches"
    """Create and delete branches."""
    CONFIGURE_BRANCH = "configure_branch"
    """Update an existing branch's settings."""
    MANAGE_MENU = "manage_menu"
    """Categories, items, variants, modifiers, combos, branch menus, media."""
    MANAGE_FLOOR = "manage_floor"
    """Dining areas, table setup, and table QR codes."""
    SERVE_TABLES = "serve_tables"
    """Table sessions, table status, transfers, and merges."""
    TAKE_ORDERS = "take_orders"
    """Create orders for guests."""
    OPERATE_KITCHEN = "operate_kitchen"
    """Kitchen display actions and kitchen station setup."""
    TAKE_PAYMENTS = "take_payments"
    """Settle bills and take KHQR or cash payments."""
    MANAGE_PROMOTIONS = "manage_promotions"
    """Create and change promotions."""
    MANAGE_INVENTORY = "manage_inventory"
    """Inventory items, stock adjustments, and transfers."""
    VIEW_REPORTS = "view_reports"
    """Sales analytics and reports."""


_ALL_PERMISSIONS = frozenset(Permission)

ROLE_PERMISSIONS: dict[StaffRole, frozenset[Permission]] = {
    StaffRole.OWNER: _ALL_PERMISSIONS,
    # Managers run branch operations but do not change business-wide settings or
    # create and delete branches.
    StaffRole.MANAGER: _ALL_PERMISSIONS
    - {Permission.MANAGE_BUSINESS, Permission.MANAGE_BRANCHES},
    StaffRole.CASHIER: frozenset(
        {Permission.SERVE_TABLES, Permission.TAKE_ORDERS, Permission.TAKE_PAYMENTS}
    ),
    StaffRole.WAITER: frozenset({Permission.SERVE_TABLES, Permission.TAKE_ORDERS}),
    StaffRole.KITCHEN: frozenset({Permission.OPERATE_KITCHEN}),
    StaffRole.INVENTORY: frozenset({Permission.MANAGE_INVENTORY}),
    StaffRole.MENU_EDITOR: frozenset({Permission.MANAGE_MENU}),
    StaffRole.REPORT_VIEWER: frozenset({Permission.VIEW_REPORTS}),
}


def has_permission(membership: OrganizationMembership, permission: Permission) -> bool:
    """Returns whether a membership's role grants the permission."""
    if membership.is_owner:
        return True
    try:
        role = StaffRole(membership.role)
    except ValueError:
        return False
    return permission in ROLE_PERMISSIONS.get(role, frozenset())


def _build_check(
    permission: Permission, *, reads_allowed: bool
) -> Callable[..., Awaitable[TenantContext]]:
    async def check(
        request: Request,
        tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    ) -> TenantContext:
        if reads_allowed and request.method in _READ_METHODS:
            return tenant
        if not has_permission(tenant.membership, permission):
            logger.warning(
                "Staff action denied by role",
                permission=permission.value,
                role=str(tenant.membership.role),
                user_id=str(tenant.user_id),
                organization_id=str(tenant.organization_id),
                method=request.method,
                path=request.url.path,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your staff role does not allow this action.",
            )
        return tenant

    return check


def require_permission(
    permission: Permission,
) -> Callable[..., Awaitable[TenantContext]]:
    """Dependency that requires the permission for every request method."""
    return _build_check(permission, reads_allowed=False)


def require_permission_for_writes(
    permission: Permission,
) -> Callable[..., Awaitable[TenantContext]]:
    """Dependency that lets any member read but requires the permission to change data."""
    return _build_check(permission, reads_allowed=True)
