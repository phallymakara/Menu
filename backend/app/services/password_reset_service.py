"""Self-service password reset with single-use, short-lived tokens."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import structlog
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import InvalidTokenError
from app.core.security import (
    generate_opaque_token,
    hash_opaque_token,
    hash_password_async,
)
from app.models.enums import UserStatus
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services.audit_service import record_audit_log
from app.services.auth_service import find_users_by_identifier
from app.services.password_reset_delivery import (
    PasswordResetChannel,
    PasswordResetTicket,
)
from app.services.token_service import revoke_all_sessions

logger = structlog.get_logger("app.services.password_reset_service")

PASSWORD_RESET_TOKEN_BYTES = 32


def _as_utc(value: datetime) -> datetime:
    """Return ``value`` as an aware UTC datetime (SQLite returns naive values)."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def request_password_reset(
    session: AsyncSession,
    identifier: str,
) -> PasswordResetTicket | None:
    """
    Issue a reset token for the active account matching an email or phone number.

    Any earlier tokens of that account are discarded, so only the newest link works.
    The caller must respond identically whether or not a ticket is returned, so the
    endpoint cannot be used to discover which accounts exist.

    Returns:
        The ticket to deliver, or None when no active account matches.
    """
    channel: PasswordResetChannel = "email" if "@" in identifier else "sms"
    users = await find_users_by_identifier(session, identifier)
    user = next((u for u in users if u.status == UserStatus.ACTIVE), None)
    destination = None
    if user is not None:
        destination = user.email if channel == "email" else user.phone

    if user is None or destination is None:
        logger.info("Password reset requested for no active account", channel=channel)
        return None

    now = datetime.now(UTC)
    await session.execute(
        delete(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id)
        .execution_options(synchronize_session="fetch")
    )

    raw_token = generate_opaque_token(PASSWORD_RESET_TOKEN_BYTES)
    expires_at = now + timedelta(minutes=settings.password_reset_token_expire_minutes)
    session.add(
        PasswordResetToken(
            id=uuid4(),
            user_id=user.id,
            token_hash=hash_opaque_token(raw_token),
            expires_at=expires_at,
        )
    )
    await record_audit_log(
        session=session,
        action="AUTH_PASSWORD_RESET_REQUESTED",
        user_id=user.id,
        resource_type="user",
        resource_id=str(user.id),
        details={"channel": channel},
    )
    await session.commit()

    logger.info("Password reset token issued", user_id=str(user.id), channel=channel)
    return PasswordResetTicket(
        user_id=user.id,
        channel=channel,
        destination=destination,
        token=raw_token,
        expires_at=expires_at,
    )


async def confirm_password_reset(
    session: AsyncSession,
    raw_token: str,
    new_password: str,
) -> UUID:
    """
    Redeem a reset token: set the new password and sign out every session.

    The token is consumed, any other outstanding token of the user is invalidated,
    and all of the user's refresh tokens are revoked.

    Returns:
        The id of the user whose password was reset.

    Raises:
        InvalidTokenError: The token is unknown, already used, or expired, or the
            account is no longer active.
    """
    now = datetime.now(UTC)
    result = await session.execute(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == hash_opaque_token(raw_token))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    reset_token = result.scalar_one_or_none()

    if reset_token is None:
        logger.warning("Password reset rejected: unknown token")
        raise InvalidTokenError("Invalid or expired password reset token.")

    if reset_token.used_at is not None:
        logger.warning(
            "Password reset rejected: token already used",
            user_id=str(reset_token.user_id),
        )
        raise InvalidTokenError("Invalid or expired password reset token.")

    if _as_utc(reset_token.expires_at) <= now:
        logger.info(
            "Password reset rejected: token expired",
            user_id=str(reset_token.user_id),
        )
        raise InvalidTokenError("Invalid or expired password reset token.")

    user = await session.get(User, reset_token.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        logger.warning(
            "Password reset rejected: account is not active",
            user_id=str(reset_token.user_id),
        )
        raise InvalidTokenError("Invalid or expired password reset token.")

    user.password_hash = await hash_password_async(new_password)
    await session.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    await revoke_all_sessions(session, user.id)
    await record_audit_log(
        session=session,
        action="AUTH_PASSWORD_RESET",
        user_id=user.id,
        resource_type="user",
        resource_id=str(user.id),
    )
    await session.commit()

    logger.info("Password reset completed, all sessions revoked", user_id=str(user.id))
    return user.id
