from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidTokenError
from app.core.security import decode_access_token
from app.db.session import get_db_session
from app.models.enums import UserStatus
from app.models.user import User

logger = structlog.get_logger("app.api.dependencies.auth")

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials,
        Depends(bearer_scheme),
    ],
    session: Annotated[
        AsyncSession,
        Depends(get_db_session),
    ],
) -> User:
    """Return the active user represented by a valid access token."""
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate authentication credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        user_id = decode_access_token(credentials.credentials)
    except InvalidTokenError as exc:
        logger.warning("Token decoding failed", error=str(exc))
        raise credentials_error from exc

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        logger.warning("User not found for token subject", user_id=str(user_id))
        raise credentials_error

    if user.status != UserStatus.ACTIVE:
        logger.warning(
            "User account is not active",
            user_id=str(user_id),
            status=user.status,
        )
        raise credentials_error

    return user
