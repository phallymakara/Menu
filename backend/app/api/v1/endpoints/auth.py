from datetime import datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.dependencies.auth import get_current_token_expiry, get_current_user
from app.api.dependencies.tenant import get_current_tenant_context
from app.core.client_ip import client_ip_from_request
from app.core.config import settings
from app.core.exceptions import (
    InactiveAccountError,
    InvalidCredentialsError,
    InvalidTokenError,
    RateLimitExceededError,
    RegistrationConflictError,
)
from app.core.rate_limit import RateLimiter, get_rate_limiter
from app.core.tenant import TenantContext
from app.db.session import get_db_session, get_session_factory
from app.models.enums import MembershipStatus, OrganizationStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.schemas.auth import (
    AccessTokenResponse,
    CurrentUserResponse,
    LoginRequest,
    MembershipResponse,
    MessageResponse,
    OwnerRegistrationRequest,
    OwnerRegistrationResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    RefreshTokenRequest,
)
from app.schemas.branch_roaming import (
    MyBranchesResponse,
    SwitchBranchRequest,
    SwitchBranchResponse,
)
from app.services.auth_service import (
    authenticate_user,
    enforce_login_rate_limit,
    enforce_password_reset_confirm_rate_limit,
    enforce_password_reset_rate_limit,
    enforce_refresh_rate_limit,
    enforce_registration_rate_limit,
    register_owner,
)
from app.services.branch_roaming_service import (
    get_user_accessible_branches,
    switch_active_branch,
)
from app.services.password_reset_delivery import (
    PasswordResetDelivery,
    get_password_reset_delivery,
)
from app.services.password_reset_service import (
    confirm_password_reset,
    process_password_reset_request,
)
from app.services.token_service import (
    revoke_session,
    rotate_refresh_token,
    start_session,
)

logger = structlog.get_logger("app.api.v1.endpoints.auth")

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

PASSWORD_RESET_REQUEST_MESSAGE = (
    "If an account matches the details provided, "
    "instructions to reset the password have been sent."
)


def _too_many_requests(exc: RateLimitExceededError) -> HTTPException:
    """Map a rate limit rejection to HTTP 429 with a Retry-After header."""
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many attempts. Please try again later.",
        headers={"Retry-After": str(exc.retry_after_seconds)},
    )


@router.post(
    "/register",
    response_model=OwnerRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/register-owner",
    response_model=OwnerRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_owner_endpoint(
    payload: OwnerRegistrationRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> OwnerRegistrationResponse:
    """
    HTTP POST endpoint to register a new tenant owner and their organization workspace.

    This endpoint:
    - Applies the per-IP registration rate limit.
    - Initiates owner and organization registration using auth_service.
    - Starts a login session (access and refresh token).
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
        is already in use; 429 when the client IP made too many attempts.
    """
    try:
        await enforce_registration_rate_limit(limiter, client_ip_from_request(request))
    except RateLimitExceededError as exc:
        raise _too_many_requests(exc) from exc

    try:
        # Call service to register owner and create workspace resources
        user, organization, business, branch = await register_owner(
            session=session,
            payload=payload,
        )
        tokens = await start_session(session, user.id)

        # Commit transaction to database
        await session.commit()

        return OwnerRegistrationResponse(
            user_id=str(user.id),
            organization_id=str(organization.id),
            business_id=str(business.id),
            branch_id=str(branch.id),
            access_token=tokens.access_token,
            token_type="bearer",
            refresh_token=tokens.refresh_token,
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
    responses={429: {"description": "Too many login attempts"}},
)
async def login(
    payload: LoginRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> AccessTokenResponse:
    """
    Authenticate by email or Cambodian phone number and start a session.

    Returns a short-lived access token and a refresh token. Attempts are rate
    limited per client IP, strictly per identifier and client IP, and more loosely
    per account across all IP addresses (see ``authenticate_user`` for why).
    """
    try:
        await enforce_login_rate_limit(
            limiter,
            identifier=payload.identifier,
            client_ip=client_ip_from_request(request),
        )
    except RateLimitExceededError as exc:
        raise _too_many_requests(exc) from exc

    try:
        user = await authenticate_user(
            session=session,
            identifier=payload.identifier,
            password=payload.password,
            limiter=limiter,
        )
    except RateLimitExceededError as exc:
        raise _too_many_requests(exc) from exc
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

    tokens = await start_session(session, user.id)

    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="AUTH_LOGIN",
        user_id=user.id,
        resource_type="user",
        resource_id=str(user.id),
        details={"identifier": payload.identifier},
    )
    await session.commit()

    return AccessTokenResponse(
        access_token=tokens.access_token,
        expires_in=tokens.expires_in,
        refresh_token=tokens.refresh_token,
    )


@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    responses={
        401: {"description": "Invalid, expired, or revoked refresh token"},
        429: {"description": "Too many refresh requests"},
    },
)
async def refresh_session(
    payload: RefreshTokenRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> AccessTokenResponse:
    """
    Rotate a refresh token and return a new access token and refresh token.

    The presented refresh token is single use. Presenting it again revokes every
    token of the session, which signs the session out everywhere. Requests are
    rate limited per client IP.
    """
    try:
        await enforce_refresh_rate_limit(limiter, client_ip_from_request(request))
    except RateLimitExceededError as exc:
        raise _too_many_requests(exc) from exc

    try:
        tokens = await rotate_refresh_token(session, payload.refresh_token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return AccessTokenResponse(
        access_token=tokens.access_token,
        expires_in=tokens.expires_in,
        refresh_token=tokens.refresh_token,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout(
    payload: RefreshTokenRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    """
    Revoke the session that owns the presented refresh token.

    Always returns 204, even for unknown tokens. Access tokens already issued stay
    valid until they expire, so clients must discard them.
    """
    await revoke_session(session, payload.refresh_token)


@router.post(
    "/password-reset/request",
    response_model=PasswordResetRequestResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_202_ACCEPTED,
    responses={429: {"description": "Too many reset requests"}},
)
async def request_password_reset_endpoint(
    payload: PasswordResetRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    session_factory: Annotated[
        async_sessionmaker[AsyncSession], Depends(get_session_factory)
    ],
    delivery: Annotated[PasswordResetDelivery, Depends(get_password_reset_delivery)],
) -> PasswordResetRequestResponse:
    """
    Send password reset instructions to the account with this email or phone.

    The response cannot reveal whether an account matches: it is always 202 with
    the same body and headers, and the account lookup, token, and delivery all run
    in a background task after the response is sent, so timing does not differ
    either. Rate limits apply per identifier and client IP before anything else,
    for known and unknown identifiers alike.

    Only when ENVIRONMENT is 'development' is the work done inline, so the
    response can include ``debug_reset_token`` (no email or SMS provider exists
    yet).
    """
    try:
        await enforce_password_reset_rate_limit(
            limiter,
            identifier=payload.identifier,
            client_ip=client_ip_from_request(request),
        )
    except RateLimitExceededError as exc:
        raise _too_many_requests(exc) from exc

    if settings.is_development:
        ticket = await process_password_reset_request(
            session_factory, payload.identifier, delivery
        )
        return PasswordResetRequestResponse(
            message=PASSWORD_RESET_REQUEST_MESSAGE,
            debug_reset_token=ticket.token if ticket is not None else None,
        )

    background_tasks.add_task(
        process_password_reset_request,
        session_factory,
        payload.identifier,
        delivery,
    )
    return PasswordResetRequestResponse(message=PASSWORD_RESET_REQUEST_MESSAGE)


@router.post(
    "/password-reset/confirm",
    response_model=MessageResponse,
    responses={
        400: {"description": "Invalid, used, or expired reset token"},
        429: {"description": "Too many attempts"},
    },
)
async def confirm_password_reset_endpoint(
    payload: PasswordResetConfirmRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> MessageResponse:
    """
    Set a new password with a reset token and sign the account out everywhere.

    The token is single use. The password policy is the same as for registration.
    Attempts are rate limited per client IP.
    """
    try:
        await enforce_password_reset_confirm_rate_limit(
            limiter, client_ip_from_request(request)
        )
    except RateLimitExceededError as exc:
        raise _too_many_requests(exc) from exc

    try:
        await confirm_password_reset(
            session,
            raw_token=payload.token,
            new_password=payload.new_password,
        )
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        ) from exc

    return MessageResponse(
        message="Your password has been reset. Please sign in with your new password."
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


# ---------------------------------------------------------------------------
# Multi-Branch Staff Roaming & Branch Switching
# ---------------------------------------------------------------------------


@router.get(
    "/my-branches",
    response_model=MyBranchesResponse,
    status_code=status.HTTP_200_OK,
    summary="List all branches accessible to the authenticated staff member",
)
async def get_my_branches_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MyBranchesResponse:
    """
    Returns list of accessible branches:
    - Brand Owners and General Managers see all active organization branches.
    - Branch Managers and local staff see only their single assigned home branch.
    """
    return await get_user_accessible_branches(
        session=session,
        user=current_user,
        tenant=tenant,
    )


@router.post(
    "/switch-branch",
    response_model=SwitchBranchResponse,
    status_code=status.HTTP_200_OK,
    summary="Switch active working branch context (Brand Owners & General Managers only)",
)
async def switch_branch_endpoint(
    payload: SwitchBranchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[TenantContext, Depends(get_current_tenant_context)],
    token_expires_at: Annotated[datetime, Depends(get_current_token_expiry)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SwitchBranchResponse:
    """
    Switches active working branch context for Brand Owners and General Managers.
    Returns a JWT with the target active_branch_id that expires at the same time as
    the token used for this request, so switching never extends a session.
    Branch Managers and local staff attempting to switch outside their assigned branch will receive HTTP 403 Forbidden.
    """
    return await switch_active_branch(
        session=session,
        user=current_user,
        tenant=tenant,
        target_branch_id=payload.branch_id,
        token_expires_at=token_expires_at,
    )
