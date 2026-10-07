"""
Delivery of password reset tokens to account owners.

No email or SMS provider is integrated yet, so the default delivery sends nothing
and users cannot complete a reset on their own. Production needs a real
implementation of ``PasswordResetDelivery`` (for example an email API for
``channel == "email"`` and an SMS gateway for ``channel == "sms"``) returned by
``get_password_reset_delivery``.

Implementations must never log the token, the reset URL, or the destination
address, and should raise on failure: ``deliver_password_reset`` logs a safe
summary of the error.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol
from urllib.parse import urlencode
from uuid import UUID

import structlog

from app.core.config import settings

logger = structlog.get_logger("app.services.password_reset_delivery")

PasswordResetChannel = Literal["email", "sms"]


@dataclass(frozen=True, slots=True)
class PasswordResetTicket:
    """A freshly issued reset token and where to send it."""

    user_id: UUID
    channel: PasswordResetChannel
    destination: str
    token: str
    expires_at: datetime

    @property
    def reset_url(self) -> str:
        """Frontend page that redeems the token."""
        base_url = settings.frontend_base_url.rstrip("/")
        return f"{base_url}/reset-password?{urlencode({'token': self.token})}"


class PasswordResetDelivery(Protocol):
    """Sends a password reset token to the account owner."""

    async def send(self, ticket: PasswordResetTicket) -> None:
        """Deliver ``ticket.reset_url`` (or the token) to ``ticket.destination``."""
        ...


class NoopPasswordResetDelivery:
    """Default delivery used until an email or SMS provider is configured."""

    async def send(self, ticket: PasswordResetTicket) -> None:
        """Skip delivery, logging only safe metadata."""
        logger.warning(
            "Password reset not delivered: no email or SMS provider is configured",
            user_id=str(ticket.user_id),
            channel=ticket.channel,
        )


def get_password_reset_delivery() -> PasswordResetDelivery:
    """FastAPI dependency returning the configured delivery (override in tests)."""
    return NoopPasswordResetDelivery()


async def deliver_password_reset(
    delivery: PasswordResetDelivery,
    ticket: PasswordResetTicket,
) -> None:
    """
    Deliver a ticket, logging failures instead of raising.

    It runs as a background task after the response is sent, so response time
    does not reveal whether an account matched.
    """
    try:
        await delivery.send(ticket)
    except Exception as exc:
        logger.error(
            "Password reset delivery failed",
            user_id=str(ticket.user_id),
            channel=ticket.channel,
            error_type=type(exc).__name__,
        )
