"""Password hashing, opaque token helpers, and JWT access tokens."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt
from anyio import CapacityLimiter, to_thread
from jwt import InvalidTokenError as PyJWTInvalidTokenError
from pwdlib import PasswordHash

from app.core.config import settings
from app.core.exceptions import InvalidTokenError

password_hash = PasswordHash.recommended()

# Argon2 is deliberately slow and memory hungry, so it runs in worker threads to keep
# the event loop free. A dedicated limiter caps how many run at once, which bounds
# memory use and keeps hashing from starving the default thread pool.
_password_hash_limiter = CapacityLimiter(settings.password_hash_max_concurrency)


def hash_password(password: str) -> str:
    """Hash a plain-text password using Argon2id (blocking; prefer the async variant)."""
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """Verify a plain-text password against its stored hash (blocking)."""
    return password_hash.verify(
        plain_password,
        hashed_password,
    )


async def hash_password_async(password: str) -> str:
    """Hash a password in a worker thread so the event loop is not blocked."""
    return await to_thread.run_sync(
        hash_password,
        password,
        limiter=_password_hash_limiter,
    )


async def verify_password_async(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """Verify a password in a worker thread so the event loop is not blocked."""
    return await to_thread.run_sync(
        verify_password,
        plain_password,
        hashed_password,
        limiter=_password_hash_limiter,
    )


def generate_opaque_token(num_bytes: int = 32) -> str:
    """Return a URL-safe random token for refresh or password reset flows."""
    return secrets.token_urlsafe(num_bytes)


def hash_opaque_token(token: str) -> str:
    """
    Return the SHA-256 hex digest of an opaque token.

    Only this digest is stored. The tokens are long random values, so a plain
    digest is enough to keep a database leak from exposing usable tokens.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(
    user_id: UUID,
    active_branch_id: UUID | None = None,
    expires_at: datetime | None = None,
) -> str:
    """
    Create a short-lived JWT access token for a user.

    Args:
        user_id: The authenticated user.
        active_branch_id: Optional active branch context to embed in the token.
        expires_at: Optional fixed expiry. Use it to re-issue a token without
            extending the lifetime of the token it replaces. Defaults to
            ACCESS_TOKEN_EXPIRE_MINUTES from now.
    """
    issued_at = datetime.now(UTC)
    if expires_at is None:
        expires_at = issued_at + timedelta(minutes=settings.access_token_expire_minutes)

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "access",
        "iat": issued_at,
        "exp": expires_at,
    }
    if active_branch_id is not None:
        payload["active_branch_id"] = str(active_branch_id)

    return jwt.encode(
        payload,
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> UUID:
    """Decode and validate a JWT access token, returning the user_id."""
    payload = decode_token_payload(token)
    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise InvalidTokenError("Invalid token subject.")
    try:
        return UUID(subject)
    except ValueError as exc:
        raise InvalidTokenError("Invalid token subject format.") from exc


def get_access_token_expiry(token: str) -> datetime:
    """Return the expiry of a valid access token as an aware UTC datetime."""
    payload = decode_token_payload(token)
    expires_at = payload.get("exp")
    if not isinstance(expires_at, int | float):
        raise InvalidTokenError("Invalid token expiry.")
    return datetime.fromtimestamp(expires_at, UTC)


def decode_token_payload(token: str) -> dict[str, Any]:
    """Decode and return the full JWT payload dictionary of an access token."""
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
        if payload.get("type") != "access":
            raise InvalidTokenError("Invalid token type.")
        return payload
    except (
        PyJWTInvalidTokenError,
        ValueError,
    ) as exc:
        raise InvalidTokenError("Invalid or expired access token.") from exc
