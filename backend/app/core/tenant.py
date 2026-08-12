from dataclasses import dataclass
from uuid import UUID

from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User


@dataclass(frozen=True)
class TenantContext:
    """
    Represents the resolved tenant context for an authenticated API request.

    Contains the authenticated user, their active organization, and their
    active membership record.
    """

    user: User
    organization: Organization
    membership: OrganizationMembership

    @property
    def organization_id(self) -> UUID:
        """Return the active organization ID."""
        return self.organization.id

    @property
    def user_id(self) -> UUID:
        """Return the authenticated user ID."""
        return self.user.id
