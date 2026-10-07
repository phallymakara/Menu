class RegistrationConflictError(Exception):
    """Raised when a registration conflicts with existing data."""


class InvalidCredentialsError(Exception):
    """Raised when login credentials are invalid."""


class InactiveAccountError(Exception):
    """Raised when a user account cannot authenticate."""


class InvalidTokenError(Exception):
    """Raised when an authentication token is invalid or expired."""


class RefreshTokenReuseError(InvalidTokenError):
    """Raised when a revoked refresh token is presented again; its family is revoked."""


class RateLimitExceededError(Exception):
    """Raised when a caller exceeds a rate limit for an abuse-prone operation."""

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many requests. Please try again later.")
        self.retry_after_seconds = retry_after_seconds


class TenantContextError(Exception):
    """Base exception for tenant context failures."""


class TenantNotFoundError(TenantContextError):
    """Raised when an organization or tenant context cannot be found or accessed."""


class TenantInactiveError(TenantContextError):
    """Raised when an organization or membership is inactive or suspended."""


class CrossTenantAccessError(TenantContextError):
    """Raised when accessing resources outside the active tenant."""


class ResourceConflictError(Exception):
    """Raised when a resource operation conflicts with existing unique constraints."""


class PermissionDeniedError(Exception):
    """Raised when a user lacks permission to perform a specific action."""


class EntitlementLimitExceededError(Exception):
    """Raised when an organization attempts an action exceeding its plan limits."""


class PaymentAccountNotConfiguredError(Exception):
    """Raised when no account is configured to receive a payment method."""


class PaymentProviderNotConfiguredError(Exception):
    """Raised when a payment provider integration is not configured on the server."""


class PaymentProviderUnavailableError(Exception):
    """Raised when a payment provider cannot be reached or returns an unusable response."""


class PaymentNotReceivedError(Exception):
    """Raised when the payment provider has not received a payment yet."""


class PaymentAttemptExpiredError(Exception):
    """Raised when a payment attempt expired before the payment was received."""
