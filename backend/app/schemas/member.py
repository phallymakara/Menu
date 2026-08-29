from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.models.enums import MembershipStatus, StaffRole


class MemberInvite(BaseModel):
    """Schema for inviting or directly provisioning a new staff member."""

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
        description="Optional assigned branch ID for branch isolation",
    )
    job_title: str | None = Field(
        default=None,
        max_length=100,
        description="Custom job title / display label",
    )
    pos_pin: str | None = Field(
        default=None,
        max_length=64,
        description="4-6 digit numeric POS PIN code",
    )
    avatar_url: str | None = Field(
        default=None,
        max_length=500,
        description="Profile photo or avatar URL",
    )
    password: str | None = Field(
        default=None,
        min_length=6,
        max_length=128,
        description="Optional direct password for staff login without invitation token",
    )

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return StaffRole(v.lower())
            except ValueError:
                pass
        return v

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def empty_phone_to_none(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.strip():
            return None
        return v

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
    """Schema for updating a member's role, branch assignment, title, PIN, avatar, or status."""

    full_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = Field(default=None)
    role: StaffRole | None = Field(default=None, description="Updated staff role")
    branch_id: UUID | None = Field(
        default=None,
        description="Updated branch assignment (pass null to unassign)",
    )
    job_title: str | None = Field(default=None, max_length=100)
    pos_pin: str | None = Field(default=None, max_length=64, description="Updated POS PIN")
    avatar_url: str | None = Field(default=None, max_length=500, description="Updated avatar photo URL")
    status: MembershipStatus | None = Field(
        default=None,
        description="Updated membership status (e.g. suspended, active, terminated)",
    )

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return StaffRole(v.lower())
            except ValueError:
                pass
        return v



class MemberResponse(BaseModel):
    """Response schema representing an organization staff member."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    user_id: UUID
    email: str | None = None
    phone: str | None = None
    full_name: str
    avatar_url: str | None = None
    role: StaffRole
    is_owner: bool
    job_title: str | None = None
    pos_pin: str | None = None
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
    pos_pin: str | None = None
    avatar_url: str | None = None
