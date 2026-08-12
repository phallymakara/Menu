class RegistrationConflictError(Exception):
    """Raised when a registration conflicts with existing data."""


class InvalidCredentialsError(Exception):
    """Raised when login credentials are invalid."""


class InactiveAccountError(Exception):
    """Raised when a user account cannot authenticate."""


class InvalidTokenError(Exception):
    """Raised when an authentication token is invalid or expired."""


class TenantContextError(Exception):
    """Base exception for tenant context failures."""


class TenantNotFoundError(TenantContextError):
    """Raised when an organization or tenant context cannot be found or accessed."""


class TenantInactiveError(TenantContextError):
    """Raised when an organization or membership is inactive or suspended."""


class CrossTenantAccessError(TenantContextError):
    """Raised when accessing resources outside the active tenant."""
