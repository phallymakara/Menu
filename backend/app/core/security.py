from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from jwt import InvalidTokenError as PyJWTInvalidTokenError
from pwdlib import PasswordHash

from app.core.config import settings
from app.core.exceptions import InvalidTokenError

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Hash a plain-text password using Argon2id."""
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """Verify a plain-text password against its stored hash."""
    return password_hash.verify(
        plain_password,
        hashed_password,
    )


def create_access_token(user_id: UUID) -> str:
    """Create a short-lived JWT access token for a user."""
    issued_at = datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=settings.access_token_expire_minutes)

    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": issued_at,
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> UUID:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )

        if payload.get("type") != "access":
            raise InvalidTokenError("Invalid token type.")

        subject = payload.get("sub")

        if not isinstance(subject, str):
            raise InvalidTokenError("Invalid token subject.")

        return UUID(subject)

    except (
        PyJWTInvalidTokenError,
        ValueError,
    ) as exc:
        raise InvalidTokenError("Invalid or expired access token.") from exc
