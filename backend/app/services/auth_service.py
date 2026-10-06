import re
import secrets
from uuid import uuid4

import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    InactiveAccountError,
    InvalidCredentialsError,
    RegistrationConflictError,
)
from app.core.phone import normalize_cambodian_phone
from app.core.rate_limit import (
    RateLimiter,
    RateLimitRule,
    enforce_rate_limit,
    ensure_rate_limit_available,
    record_rate_limit_hit,
)
from app.core.security import hash_password_async, verify_password_async
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import MembershipStatus, OrganizationStatus, StaffRole, UserStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.schemas.auth import OwnerRegistrationRequest

logger = structlog.get_logger("app.services.auth_service")


def _generate_slug(name: str) -> str:
    """Generates a URL-safe slug from a business name."""
    cleaned = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not cleaned:
        cleaned = "org"
    return f"{cleaned[:30]}-{secrets.token_hex(3)}"


async def register_owner(
    session: AsyncSession,
    payload: OwnerRegistrationRequest,
) -> tuple[User, Organization, Business, Branch]:
    """
    Registers a new business owner and sets up their tenant organization workspace.
    """
    org_name = payload.organization_name or f"{payload.full_name}'s Restaurant"
    org_slug = payload.organization_slug or _generate_slug(org_name)
    biz_name_en = payload.business_name_en or org_name
    biz_name_km = payload.business_name_km
    biz_type = payload.business_type or "Restaurant"
    branch_name_en = payload.branch_name_en or "Main Branch"
    branch_name_km = payload.branch_name_km
    branch_code = payload.branch_code or "MAIN"

    logger.info(
        "Starting owner registration process",
        organization_name=org_name,
        organization_slug=org_slug,
    )

    normalized_phone = (
        normalize_cambodian_phone(payload.phone) if payload.phone is not None else None
    )

    contact_conditions = []

    # 1. Validate contact uniqueness (email and/or phone)
    if payload.email is not None:
        contact_conditions.append(User.email == str(payload.email).lower())

    if normalized_phone is not None and payload.phone is not None:
        phone_variants = [normalized_phone, payload.phone.strip()]
        if normalized_phone.startswith("+855"):
            phone_variants.append("0" + normalized_phone[4:])
        contact_conditions.append(User.phone.in_(list(set(phone_variants))))

    if contact_conditions:
        logger.debug(
            "Checking uniqueness of contact email and phone",
            has_email=payload.email is not None,
            has_phone=normalized_phone is not None,
        )
        existing_user_result = await session.execute(
            select(User).where(or_(*contact_conditions))
        )
        existing_user = existing_user_result.scalar_one_or_none()

        if existing_user is not None:
            conflict_fields = []
            if payload.email and existing_user.email == str(payload.email).lower():
                conflict_fields.append("email")
            if normalized_phone and existing_user.phone == normalized_phone:
                conflict_fields.append("phone")
            logger.warning(
                "Owner registration failed: contact info already exists",
                conflict_fields=conflict_fields,
            )
            raise RegistrationConflictError(
                "A user with this email or phone already exists."
            )

    # 2. Validate organization slug uniqueness
    logger.debug(
        "Checking uniqueness of organization slug",
        slug=org_slug,
    )
    existing_slug_result = await session.execute(
        select(Organization).where(Organization.slug == org_slug)
    )

    if existing_slug_result.scalar_one_or_none() is not None:
        logger.warning(
            "Owner registration failed: organization slug already in use",
            slug=org_slug,
        )
        raise RegistrationConflictError("This organization slug is already in use.")

    logger.info(
        "Validation checks passed, creating owner and tenant records",
        organization_slug=org_slug,
    )

    # 3. Create all initial tenant entity records with explicit UUIDs
    user_id = uuid4()
    org_id = uuid4()
    biz_id = uuid4()
    branch_id = uuid4()
    membership_id = uuid4()

    user = User(
        id=user_id,
        email=str(payload.email).lower() if payload.email else None,
        phone=normalized_phone,
        password_hash=await hash_password_async(payload.password),
        full_name=payload.full_name,
        preferred_language="km",
        status=UserStatus.ACTIVE,
        is_verified=False,
        is_platform_admin=False,
    )

    organization = Organization(
        id=org_id,
        name=org_name,
        slug=org_slug,
        status=OrganizationStatus.ACTIVE,
        is_active=True,
    )

    membership = OrganizationMembership(
        id=membership_id,
        organization_id=org_id,
        user_id=user_id,
        role=StaffRole.OWNER,
        status=MembershipStatus.ACTIVE,
        job_title="Owner",
        is_owner=True,
    )

    business = Business(
        id=biz_id,
        organization_id=org_id,
        name_en=biz_name_en,
        name_km=biz_name_km,
        business_type=biz_type,
        is_active=True,
    )

    branch = Branch(
        id=branch_id,
        organization_id=org_id,
        business_id=biz_id,
        name_en=branch_name_en,
        name_km=branch_name_km,
        code=branch_code,
        timezone="Asia/Phnom_Penh",
        default_language="km",
        base_currency="USD",
        is_active=True,
    )

    session.add_all([user, organization, membership, business, branch])

    # 4. Auto-provision 30-day trial subscription (Standard plan)
    from app.services.subscription_service import provision_trial_subscription

    await provision_trial_subscription(session, org_id)

    # 5. Record audit log for registration
    from app.services.audit_service import record_audit_log

    await record_audit_log(
        session=session,
        action="AUTH_REGISTER",
        organization_id=org_id,
        user_id=user_id,
        resource_type="user",
        resource_id=str(user_id),
        details={"email": user.email, "organization_slug": organization.slug},
    )

    logger.info(
        "Owner registration and workspace setup completed successfully",
        user_id=str(user.id),
        organization_id=str(organization.id),
        business_id=str(business.id),
        branch_id=str(branch.id),
    )

    return user, organization, business, branch


def _phone_candidates(phone: str) -> set[str]:
    """Return the formats a phone number may have been stored in."""
    candidates = {phone}
    try:
        e164_phone = normalize_cambodian_phone(phone)
    except ValueError:
        return candidates

    candidates.add(e164_phone)
    if e164_phone.startswith("+855"):
        candidates.add("0" + e164_phone[4:])
    return candidates


def canonical_identifier(identifier: str) -> str:
    """
    Return one canonical form of an email or phone identifier.

    Emails are trimmed and lowercased, and valid Cambodian phone numbers become
    E.164, so "Owner@Example.com ", "012 345 678" and "+85512345678" each share a
    rate limit bucket with their other spellings. It applies the same normalization
    as ``find_users_by_identifier``, so every spelling that reaches an account maps
    to the same bucket.
    """
    normalized_identifier = identifier.strip().lower()
    if "@" in normalized_identifier:
        return normalized_identifier
    try:
        return normalize_cambodian_phone(normalized_identifier)
    except ValueError:
        return normalized_identifier


async def find_users_by_identifier(
    session: AsyncSession,
    identifier: str,
) -> list[User]:
    """Return the users whose email or phone number matches a login identifier."""
    normalized_identifier = identifier.strip().lower()

    if "@" in normalized_identifier:
        condition = User.email == normalized_identifier
    else:
        condition = User.phone.in_(sorted(_phone_candidates(normalized_identifier)))

    result = await session.execute(
        select(User).where(condition).order_by(User.created_at, User.id)
    )
    return list(result.scalars().all())


LOGIN_FAILURE_SCOPE = "login:account_failures"

_dummy_password_hash: str | None = None


async def _spend_password_check_time(password: str) -> None:
    """
    Run one Argon2 verification against a throwaway hash.

    It is used when no account matches, so an unknown identifier takes as long to
    reject as a wrong password and response time does not reveal which accounts
    exist.
    """
    global _dummy_password_hash
    if _dummy_password_hash is None:
        _dummy_password_hash = await hash_password_async(secrets.token_urlsafe(32))
    await verify_password_async(password, _dummy_password_hash)


def _login_failure_rule() -> RateLimitRule:
    """Failed logins allowed per account, from all IP addresses, per login window."""
    return RateLimitRule(
        settings.rate_limit_login_failures_per_account,
        settings.rate_limit_login_window_seconds,
    )


def _login_account_key(identifier: str, matched_users: list[User]) -> str:
    """
    Return the subject that failed logins are counted against, across all IPs.

    It is the account when one matches, so its email and phone share one budget.
    Otherwise it is the canonical identifier, so unknown identifiers are limited
    exactly like real accounts and a lockout reveals nothing about which exist.
    """
    if matched_users:
        return f"user:{matched_users[0].id}"
    return f"identifier:{canonical_identifier(identifier)}"


async def authenticate_user(
    session: AsyncSession,
    identifier: str,
    password: str,
    limiter: RateLimiter,
) -> User:
    """
    Authenticate a user using either email or Cambodian phone number.

    The same generic credential error, and comparable response time, is returned
    for unknown users and incorrect passwords to avoid revealing registered
    accounts. Failed attempts are counted per account across all IP addresses.
    A successful login does not reset any counter.

    Raises:
        RateLimitExceededError: The account has too many failed logins in the
            current window, from any IP address. The password is not checked.
        InvalidCredentialsError: The identifier or password is wrong.
        InactiveAccountError: The password is right but the account is not active.
    """
    matched_users = await find_users_by_identifier(session, identifier)
    account_key = _login_account_key(identifier, matched_users)
    failure_rule = _login_failure_rule()
    await ensure_rate_limit_available(
        limiter, LOGIN_FAILURE_SCOPE, failure_rule, account_key
    )

    user = None
    if not matched_users:
        await _spend_password_check_time(password)
    for candidate_user in matched_users:
        if await verify_password_async(password, candidate_user.password_hash):
            user = candidate_user
            break

    if user is None:
        await record_rate_limit_hit(
            limiter, LOGIN_FAILURE_SCOPE, failure_rule, account_key
        )
        if matched_users:
            logger.warning("Authentication failed: incorrect password")
        else:
            logger.warning("Authentication failed: user not found")
        raise InvalidCredentialsError("Invalid email, phone number, or password.")

    if user.status != UserStatus.ACTIVE:
        logger.warning(
            "Authentication failed: account is inactive",
            user_id=str(user.id),
            status=user.status,
        )
        raise InactiveAccountError("This account is not active.")

    logger.info(
        "User authenticated successfully",
        user_id=str(user.id),
    )

    return user


async def enforce_login_rate_limit(
    limiter: RateLimiter,
    identifier: str,
    client_ip: str,
) -> None:
    """
    Count a login attempt per client IP and per identifier and client IP.

    Every attempt counts, successful or not. Failed attempts are also counted per
    account across all IP addresses by ``authenticate_user``.

    Raises:
        RateLimitExceededError: Either limit is exhausted for the current window.
    """
    window_seconds = settings.rate_limit_login_window_seconds
    await enforce_rate_limit(
        limiter,
        "login:ip",
        RateLimitRule(settings.rate_limit_login_per_ip, window_seconds),
        client_ip,
    )
    await enforce_rate_limit(
        limiter,
        "login:identifier_ip",
        RateLimitRule(settings.rate_limit_login_per_identifier, window_seconds),
        canonical_identifier(identifier),
        client_ip,
    )


async def enforce_registration_rate_limit(
    limiter: RateLimiter,
    client_ip: str,
) -> None:
    """
    Count an owner registration attempt per client IP.

    Raises:
        RateLimitExceededError: The limit is exhausted for the current window.
    """
    await enforce_rate_limit(
        limiter,
        "register:ip",
        RateLimitRule(
            settings.rate_limit_register_per_ip,
            settings.rate_limit_register_window_seconds,
        ),
        client_ip,
    )


async def enforce_refresh_rate_limit(
    limiter: RateLimiter,
    client_ip: str,
) -> None:
    """
    Count a refresh token exchange per client IP.

    Refresh tokens are long random values, so this bounds load and abuse rather
    than guessing.

    Raises:
        RateLimitExceededError: The limit is exhausted for the current window.
    """
    await enforce_rate_limit(
        limiter,
        "refresh:ip",
        RateLimitRule(
            settings.rate_limit_refresh_per_ip,
            settings.rate_limit_refresh_window_seconds,
        ),
        client_ip,
    )


async def enforce_password_reset_rate_limit(
    limiter: RateLimiter,
    identifier: str,
    client_ip: str,
) -> None:
    """
    Count a password reset request per identifier and per client IP.

    The identifier limit stops one inbox or phone from being flooded. The IP limit
    stops one client from sending resets to many accounts, which matters once an
    SMS provider (paid per message) is connected. Both apply whether or not an
    account matches, so a 429 reveals nothing about which accounts exist.

    Raises:
        RateLimitExceededError: Either limit is exhausted for the current window.
    """
    window_seconds = settings.rate_limit_password_reset_window_seconds
    await enforce_rate_limit(
        limiter,
        "password_reset:ip",
        RateLimitRule(settings.rate_limit_password_reset_per_ip, window_seconds),
        client_ip,
    )
    await enforce_rate_limit(
        limiter,
        "password_reset:identifier",
        RateLimitRule(
            settings.rate_limit_password_reset_per_identifier,
            window_seconds,
        ),
        canonical_identifier(identifier),
    )


async def enforce_password_reset_confirm_rate_limit(
    limiter: RateLimiter,
    client_ip: str,
) -> None:
    """
    Count an attempt to redeem a password reset token per client IP.

    Reset tokens are long random values, so this bounds token guessing and load.

    Raises:
        RateLimitExceededError: The limit is exhausted for the current window.
    """
    await enforce_rate_limit(
        limiter,
        "password_reset_confirm:ip",
        RateLimitRule(
            settings.rate_limit_password_reset_confirm_per_ip,
            settings.rate_limit_password_reset_window_seconds,
        ),
        client_ip,
    )
