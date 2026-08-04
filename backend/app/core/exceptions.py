class RegistrationConflictError(Exception):
    """Raised when a registration conflicts with existing data."""


class InvalidCredentialsError(Exception):
    """Raised when login credentials are invalid."""


class InactiveAccountError(Exception):
    """Raised when a user account cannot authenticate."""


class InvalidTokenError(Exception):
    """Raised when an authentication token is invalid or expired."""
