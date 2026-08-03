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
    contact_conditions = []

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

    existing_slug_result = await session.execute(
        select(Organization).where(Organization.slug == payload.organization_slug)
    )

    if existing_slug_result.scalar_one_or_none() is not None:
        raise RegistrationConflictError("This organization slug is already in use.")

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

    organization = Organization(
        name=payload.organization_name,
        slug=payload.organization_slug,
        status=OrganizationStatus.ACTIVE,
        is_active=True,
    )

    session.add_all([user, organization])
    await session.flush()

    membership = OrganizationMembership(
        organization_id=organization.id,
        user_id=user.id,
        status=MembershipStatus.ACTIVE,
        job_title="Owner",
        is_owner=True,
    )

    business = Business(
        organization_id=organization.id,
        name_en=payload.business_name_en,
        name_km=payload.business_name_km,
        business_type=payload.business_type,
        is_active=True,
    )

    session.add_all([membership, business])
    await session.flush()

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
