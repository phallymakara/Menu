from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models.enums import MembershipStatus, StaffRole


class MemberInvite(BaseModel):
    """Schema for inviting a new staff member to the organization."""

    email: EmailStr | None = Field(
        default=None,
        description="Invitee email address",
    )
    phone: str | None = Field(
        default=None,
        max_length=30,
        description="Invitee phone number (e.g. +855...)",
    )
    full_name: str = Field(
        ...,
        min_length=1,
        max_length=150,
        description="Staff member full name",
    )
    role: StaffRole = Field(
        default=StaffRole.WAITER,
        description="Assigned staff role",
    )
    branch_id: UUID | None = Field(
        default=None,
        description="Optional assigned branch ID",
    )
    job_title: str | None = Field(
        default=None,
        max_length=100,
        description="Custom job title / display label",
    )

    @model_validator(mode="after")
    def validate_contact_provided(self) -> "MemberInvite":
        if not self.email and not self.phone:
            raise ValueError("Either email or phone must be provided for invitation.")
        return self


class InviteAccept(BaseModel):
    """Schema for an invited staff member to accept an invite and set password."""

    token: str = Field(
        ...,
        min_length=1,
        description="Raw invitation token received in invite link",
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New account password",
    )
    full_name: str | None = Field(
        default=None,
        max_length=150,
        description="Optional update to full name",
    )


class MemberUpdate(BaseModel):
    """Schema for updating a member's role, branch assignment, title, or status."""

    role: StaffRole | None = Field(default=None, description="Updated staff role")
    branch_id: UUID | None = Field(
        default=None,
        description="Updated branch assignment (pass null to unassign)",
    )
    job_title: str | None = Field(default=None, max_length=100)
    status: MembershipStatus | None = Field(
        default=None,
        description="Updated membership status (e.g. suspended, active, terminated)",
    )


class MemberResponse(BaseModel):
    """Response schema representing an organization staff member."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    user_id: UUID
    email: str | None = None
    phone: str | None = None
    full_name: str
    role: StaffRole
    is_owner: bool
    job_title: str | None = None
    status: MembershipStatus
    branch_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class InviteResponse(BaseModel):
    """Response schema when an invitation is successfully dispatched."""

    model_config = ConfigDict(from_attributes=True)

    member_id: UUID
    user_id: UUID
    organization_id: UUID
    role: StaffRole
    status: MembershipStatus
    invitation_token: str
    expires_at: datetime
    email: str | None = None
    phone: str | None = None
