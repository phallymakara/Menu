"""
Login sessions built from short-lived access tokens and rotating refresh tokens.

A login starts a refresh token family. Refreshing revokes the presented token and
issues a replacement in the same family. Every token in a family shares the expiry
set at login, so refreshing never extends a session beyond
REFRESH_TOKEN_EXPIRE_DAYS. Presenting a revoked token again means it was copied,
so the whole family is revoked and both the thief and the user must sign in again.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import structlog
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import InvalidTokenError, RefreshTokenReuseError
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_opaque_token,
)
from app.models.enums import UserStatus
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services.audit_service import record_audit_log

logger = structlog.get_logger("app.services.token_service")

REFRESH_TOKEN_BYTES = 48


@dataclass(frozen=True, slots=True)
class SessionTokens:
    """An access token and the refresh token that renews it."""

    access_token: str
    expires_in: int
    refresh_token: str


def _as_utc(value: datetime) -> datetime:
    """Return ``value`` as an aware UTC datetime (SQLite returns naive values)."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _add_refresh_token(
    session: AsyncSession,
    user_id: UUID,
    family_id: UUID,
    expires_at: datetime,
) -> tuple[RefreshToken, str]:
    """Stage a new refresh token row and return it with the raw token."""
    raw_token = generate_opaque_token(REFRESH_TOKEN_BYTES)
    refresh_token = RefreshToken(
        id=uuid4(),
        user_id=user_id,
        token_hash=hash_opaque_token(raw_token),
        family_id=family_id,
        expires_at=expires_at,
    )
    session.add(refresh_token)
    return refresh_token, raw_token


def _session_tokens(user_id: UUID, raw_refresh_token: str) -> SessionTokens:
    """Pair a fresh access token with a raw refresh token."""
    return SessionTokens(
        access_token=create_access_token(user_id),
        expires_in=settings.access_token_expire_minutes * 60,
        refresh_token=raw_refresh_token,
    )


async def _find_refresh_token(
    session: AsyncSession,
    raw_token: str,
    *,
    lock: bool,
) -> RefreshToken | None:
    """Load the refresh token matching ``raw_token``, optionally locking its row."""
    statement = (
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_opaque_token(raw_token))
        .execution_options(populate_existing=True)
    )
    if lock:
        statement = statement.with_for_update()

    result = await session.execute(statement)
    return result.scalar_one_or_none()


async def _revoke_family(
    session: AsyncSession,
    family_id: UUID,
    revoked_at: datetime,
) -> None:
    """Revoke every token of a family that is not revoked yet."""
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.family_id == family_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=revoked_at)
    )


async def start_session(session: AsyncSession, user_id: UUID) -> SessionTokens:
    """
    Start a new refresh token family for a user who has just authenticated.

    The user's expired refresh tokens are purged at the same time so the table
    does not grow without bound. The caller commits the transaction.
    """
    now = datetime.now(UTC)
    await session.execute(
        delete(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.expires_at <= now,
        )
        .execution_options(synchronize_session="fetch")
    )

    _, raw_token = _add_refresh_token(
        session,
        user_id=user_id,
        family_id=uuid4(),
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
    )
    return _session_tokens(user_id, raw_token)


async def rotate_refresh_token(
    session: AsyncSession,
    raw_token: str,
) -> SessionTokens:
    """
    Exchange a refresh token for a new access token and refresh token.

    The presented token is revoked and replaced by a new token in the same family
    with the same expiry. The row is locked so that two concurrent refreshes with
    one token cannot both succeed: the second one is treated as reuse.

    Raises:
        RefreshTokenReuseError: The token was already revoked. Its whole family
            has been revoked and the change is committed.
        InvalidTokenError: The token is unknown or expired, or its user can no
            longer sign in.
    """
    now = datetime.now(UTC)
    current = await _find_refresh_token(session, raw_token, lock=True)

    if current is None:
        logger.warning("Refresh rejected: unknown refresh token")
        raise InvalidTokenError("Invalid refresh token.")

    if current.revoked_at is not None:
        await _revoke_family(session, current.family_id, now)
        await record_audit_log(
            session=session,
            action="AUTH_REFRESH_TOKEN_REUSE",
            user_id=current.user_id,
            resource_type="refresh_token_family",
            resource_id=str(current.family_id),
            details={"was_rotated": current.replaced_by_id is not None},
        )
        await session.commit()
        logger.warning(
            "Refresh token reuse detected, session family revoked",
            user_id=str(current.user_id),
            family_id=str(current.family_id),
            was_rotated=current.replaced_by_id is not None,
        )
        raise RefreshTokenReuseError("Refresh token has been revoked.")

    if _as_utc(current.expires_at) <= now:
        logger.info(
            "Refresh rejected: refresh token expired",
            user_id=str(current.user_id),
            family_id=str(current.family_id),
        )
        raise InvalidTokenError("Refresh token has expired.")

    user = await session.get(User, current.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        logger.warning(
            "Refresh rejected: account is not active",
            user_id=str(current.user_id),
        )
        raise InvalidTokenError("Refresh token is no longer valid.")

    replacement, raw_replacement = _add_refresh_token(
        session,
        user_id=current.user_id,
        family_id=current.family_id,
        expires_at=_as_utc(current.expires_at),
    )
    # Insert the replacement before pointing the old row at it (self-referencing FK).
    await session.flush()
    current.revoked_at = now
    current.replaced_by_id = replacement.id
    await session.commit()

    logger.info(
        "Refresh token rotated",
        user_id=str(current.user_id),
        family_id=str(current.family_id),
    )
    return _session_tokens(current.user_id, raw_replacement)


async def revoke_session(session: AsyncSession, raw_token: str) -> UUID | None:
    """
    Log out by revoking the whole family of a refresh token.

    Unknown tokens are ignored so that logout is idempotent and reveals nothing.

    Returns:
        The id of the token's user, or None when the token is unknown.
    """
    refresh_token = await _find_refresh_token(session, raw_token, lock=False)
    if refresh_token is None:
        logger.info("Logout ignored: unknown refresh token")
        return None

    await _revoke_family(session, refresh_token.family_id, datetime.now(UTC))
    await record_audit_log(
        session=session,
        action="AUTH_LOGOUT",
        user_id=refresh_token.user_id,
        resource_type="user",
        resource_id=str(refresh_token.user_id),
    )
    await session.commit()

    logger.info(
        "Session revoked by logout",
        user_id=str(refresh_token.user_id),
        family_id=str(refresh_token.family_id),
    )
    return refresh_token.user_id


async def revoke_all_sessions(session: AsyncSession, user_id: UUID) -> None:
    """
    Revoke every refresh token of a user, for example after a password change.

    Access tokens already issued stay valid until they expire
    (ACCESS_TOKEN_EXPIRE_MINUTES). The caller commits the transaction.
    """
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    logger.info("All refresh tokens revoked for user", user_id=str(user_id))
