import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    InactiveAccountError,
    InvalidCredentialsError,
    RegistrationConflictError,
)
from app.core.phone import normalize_cambodian_phone
from app.core.security import hash_password, verify_password
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import MembershipStatus, OrganizationStatus, UserStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.schemas.auth import OwnerRegistrationRequest

logger = structlog.get_logger("app.services.auth_service")


async def register_owner(
    session: AsyncSession,
    payload: OwnerRegistrationRequest,
) -> tuple[User, Organization, Business, Branch]:
    """
    Registers a new business owner and sets up their tenant organization workspace.

    This service function performs the following steps:
    1. Validates that the provided email and/or phone number are unique.
    2. Validates that the organization slug is not already taken.
    3. Creates the User record with a hashed password.
    4. Creates the Organization record.
    5. Creates an OrganizationMembership record with 'Owner' role.
    6. Creates the initial Business record.
    7. Creates the first Branch record for the business with localized defaults.

    All operations are executed within the same database transaction.

    Args:
        session: The SQLAlchemy async database session.
        payload: The registration request payload containing owner and
                 organization details.

    Returns:
        A tuple of (User, Organization, Business, Branch) representing the
        created records.

    Raises:
        RegistrationConflictError: If the email, phone, or organization slug
                                   is already registered.
    """
    logger.info(
        "Starting owner registration process",
        organization_name=payload.organization_name,
        organization_slug=payload.organization_slug,
    )

    normalized_phone = (
        normalize_cambodian_phone(payload.phone) if payload.phone is not None else None
    )

    contact_conditions = []

    # 1. Validate contact uniqueness (email and/or phone)
    if payload.email is not None:
        contact_conditions.append(User.email == str(payload.email).lower())

    if normalized_phone is not None:
        contact_conditions.append(User.phone == normalized_phone)

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
        slug=payload.organization_slug,
    )
    existing_slug_result = await session.execute(
        select(Organization).where(Organization.slug == payload.organization_slug)
    )

    if existing_slug_result.scalar_one_or_none() is not None:
        logger.warning(
            "Owner registration failed: organization slug already in use",
            slug=payload.organization_slug,
        )
        raise RegistrationConflictError("This organization slug is already in use.")

    logger.info(
        "Validation checks passed, creating owner and tenant records",
        organization_slug=payload.organization_slug,
    )

    # 3. Create the user record
    user = User(
        email=str(payload.email).lower() if payload.email else None,
        phone=normalized_phone,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        preferred_language="km",
        status=UserStatus.ACTIVE,
        is_verified=False,
        is_platform_admin=False,
    )

    # 4. Create the organization record
    organization = Organization(
        name=payload.organization_name,
        slug=payload.organization_slug,
        status=OrganizationStatus.ACTIVE,
        is_active=True,
    )

    # Flush to generate IDs for user and organization
    session.add_all([user, organization])
    await session.flush()
    logger.debug(
        "User and organization records flushed",
        user_id=str(user.id),
        organization_id=str(organization.id),
    )

    # 5. Create membership as Owner
    membership = OrganizationMembership(
        organization_id=organization.id,
        user_id=user.id,
        status=MembershipStatus.ACTIVE,
        job_title="Owner",
        is_owner=True,
    )

    # 6. Create initial business
    business = Business(
        organization_id=organization.id,
        name_en=payload.business_name_en,
        name_km=payload.business_name_km,
        business_type=payload.business_type,
        is_active=True,
    )

    # Flush to generate business ID
    session.add_all([membership, business])
    await session.flush()
    logger.debug(
        "Membership and business records flushed",
        business_id=str(business.id),
    )

    # 7. Create initial branch
    branch = Branch(
        organization_id=organization.id,
        business_id=business.id,
        name_en=payload.branch_name_en,
        name_km=payload.branch_name_km,
        code=payload.branch_code,
        timezone="Asia/Phnom_Penh",
        default_language="km",
        base_currency="USD",
        is_active=True,
    )

    session.add(branch)
    await session.flush()

    logger.info(
        "Owner registration and workspace setup completed successfully",
        user_id=str(user.id),
        organization_id=str(organization.id),
        business_id=str(business.id),
        branch_id=str(branch.id),
    )

    return user, organization, business, branch


async def authenticate_user(
    session: AsyncSession,
    identifier: str,
    password: str,
) -> User:
    """
    Authenticate a user using either email or Cambodian phone number.

    The same generic credential error is returned for unknown users and
    incorrect passwords to avoid revealing registered accounts.
    """
    normalized_identifier = identifier.strip().lower()

    if "@" in normalized_identifier:
        condition = User.email == normalized_identifier
    else:
        try:
            normalized_phone = normalize_cambodian_phone(normalized_identifier)
        except ValueError as exc:
            logger.warning(
                "Authentication failed: invalid phone number format",
                error=str(exc),
            )
            raise InvalidCredentialsError(
                "Invalid email, phone number, or password."
            ) from exc

        condition = User.phone == normalized_phone

    result = await session.execute(select(User).where(condition))
    user = result.scalar_one_or_none()

    if user is None:
        logger.warning("Authentication failed: user not found")
        raise InvalidCredentialsError("Invalid email, phone number, or password.")

    if not verify_password(
        password,
        user.password_hash,
    ):
        logger.warning(
            "Authentication failed: incorrect password",
            user_id=str(user.id),
        )
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
