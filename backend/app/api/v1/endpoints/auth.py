from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies.auth import get_current_user
from app.core.config import settings
from app.core.exceptions import (
    InactiveAccountError,
    InvalidCredentialsError,
    RegistrationConflictError,
)
from app.core.security import create_access_token
from app.db.session import get_db_session
from app.models.enums import MembershipStatus, OrganizationStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.schemas.auth import (
    AccessTokenResponse,
    CurrentUserResponse,
    LoginRequest,
    MembershipResponse,
    OwnerRegistrationRequest,
    OwnerRegistrationResponse,
)
from app.services.auth_service import authenticate_user, register_owner

logger = structlog.get_logger("app.api.v1.endpoints.auth")

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post(
    "/register-owner",
    response_model=OwnerRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_owner_endpoint(
    payload: OwnerRegistrationRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OwnerRegistrationResponse:
    """
    HTTP POST endpoint to register a new tenant owner and their organization workspace.

    This endpoint:
    - Initiates owner and organization registration using auth_service.
    - Commits the transaction if successful.
    - Handles conflict errors and database integrity errors, mapping them to
      appropriate HTTP 409 responses.

    Args:
        payload: The request payload containing tenant owner registration details.
        session: The SQLAlchemy async database session dependency.

    Returns:
        OwnerRegistrationResponse: The details of the created resources
        with a success message.

    Raises:
        HTTPException: 409 Conflict if email, phone, or organization slug
        is already in use.
    """
    try:
        # Call service to register owner and create workspace resources
        user, organization, business, branch = await register_owner(
            session=session,
            payload=payload,
        )

        # Commit transaction to database
        await session.commit()

        return OwnerRegistrationResponse(
            user_id=str(user.id),
            organization_id=str(organization.id),
            business_id=str(business.id),
            branch_id=str(branch.id),
            message="Owner account and business workspace created successfully.",
        )

    except RegistrationConflictError as exc:
        # Handle business logic conflict (e.g. duplicate email/phone/slug)
        logger.warning(
            "Registration failed due to conflict",
            error_type="RegistrationConflictError",
            detail=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except IntegrityError as exc:
        # Handle unexpected database integrity conflicts
        logger.error(
            "Registration database integrity conflict",
            error_type="IntegrityError",
            detail=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration conflicts with existing data.",
        ) from exc


@router.post(
    "/login",
    response_model=AccessTokenResponse,
)
async def login(
    payload: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AccessTokenResponse:
    """Authenticate by email or Cambodian phone number."""
    try:
        user = await authenticate_user(
            session=session,
            identifier=payload.identifier,
            password=payload.password,
        )
    except InvalidCredentialsError as exc:
        logger.warning(
            "Login request rejected: invalid credentials",
            error_type="InvalidCredentialsError",
            detail=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except InactiveAccountError as exc:
        logger.warning(
            "Login request rejected: inactive account",
            error_type="InactiveAccountError",
            detail=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    access_token = create_access_token(user.id)

    return AccessTokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.get(
    "/me",
    response_model=CurrentUserResponse,
)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CurrentUserResponse:
    """Return the authenticated user and active organizations."""
    result = await session.execute(
        select(
            OrganizationMembership,
            Organization,
        )
        .join(
            Organization,
            Organization.id == OrganizationMembership.organization_id,
        )
        .where(
            OrganizationMembership.user_id == current_user.id,
            OrganizationMembership.status == MembershipStatus.ACTIVE,
            Organization.status == OrganizationStatus.ACTIVE,
            Organization.is_active.is_(True),
        )
    )

    memberships = [
        MembershipResponse(
            membership_id=membership.id,
            organization_id=organization.id,
            organization_name=organization.name,
            organization_slug=organization.slug,
            job_title=membership.job_title,
            is_owner=membership.is_owner,
        )
        for membership, organization in result.all()
    ]

    return CurrentUserResponse(
        user_id=current_user.id,
        email=current_user.email,
        phone=current_user.phone,
        full_name=current_user.full_name,
        preferred_language=current_user.preferred_language,
        is_platform_admin=current_user.is_platform_admin,
        memberships=memberships,
    )
