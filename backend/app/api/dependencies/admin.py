from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.api.dependencies.auth import get_current_user
from app.models.enums import UserStatus
from app.models.user import User


async def get_current_platform_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """
    Dependency that enforces platform-wide super administrator privileges.
    Verifies that the authenticated user has is_platform_admin=True and status=ACTIVE.
    Raises HTTP 403 Forbidden for non-super-admin users.
    """
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator privileges required.",
        )

    if current_user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your administrator account is not active.",
        )

    return current_user
