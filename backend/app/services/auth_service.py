from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RegistrationConflictError
from app.core.security import hash_password
from app.models.branch import Branch
from app.models.business import Business
from app.models.enums import MembershipStatus, OrganizationStatus, UserStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User
from app.schemas.auth import OwnerRegistrationRequest


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
    contact_conditions = []

    # 1. Validate contact uniqueness (email and/or phone)
    if payload.email is not None:
        contact_conditions.append(User.email == payload.email)

    if payload.phone is not None:
        contact_conditions.append(User.phone == payload.phone)

    if contact_conditions:
        existing_user_result = await session.execute(
            select(User).where(or_(*contact_conditions))
        )
        existing_user = existing_user_result.scalar_one_or_none()

        if existing_user is not None:
            raise RegistrationConflictError(
                "A user with this email or phone already exists."
            )

    # 2. Validate organization slug uniqueness
    existing_slug_result = await session.execute(
        select(Organization).where(Organization.slug == payload.organization_slug)
    )

    if existing_slug_result.scalar_one_or_none() is not None:
        raise RegistrationConflictError("This organization slug is already in use.")

    # 3. Create the user record
    user = User(
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
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

    return user, organization, business, branch
