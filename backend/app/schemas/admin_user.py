from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UserStatus


class AdminUserListItem(BaseModel):
    """User summary item for Super Admin platform directory."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="User unique identifier")
    full_name: str = Field(..., description="User full name")
    email: str | None = Field(None, description="User email address")
    phone: str | None = Field(None, description="User phone number")
    status: UserStatus = Field(..., description="User account status")
    preferred_language: str = Field("km", description="Preferred UI language")
    is_platform_admin: bool = Field(..., description="Whether user is a Platform Super Admin")
    is_verified: bool = Field(False, description="Whether phone/email is verified")
    organizations_count: int = Field(0, description="Total organizations the user belongs to")
    created_at: datetime = Field(..., description="Account creation timestamp")
    updated_at: datetime = Field(..., description="Account last update timestamp")


class AdminUserListResponse(BaseModel):
    """Paginated list response for Super Admin user directory."""

    model_config = ConfigDict(from_attributes=True)

    items: list[AdminUserListItem] = Field(..., description="List of platform users")
    total: int = Field(..., description="Total matching users")
    page: int = Field(1, description="Current page number")
    page_size: int = Field(20, description="Number of items per page")
    total_pages: int = Field(1, description="Total available pages")


class AdminMembershipDetail(BaseModel):
    """Organization membership detail for user profile inspection."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    organization_name: str
    organization_slug: str
    organization_status: str
    role: str
    status: str
    is_owner: bool
    job_title: str | None = None
    branch_id: UUID | None = None
    branch_name: str | None = None
    created_at: datetime


class AdminUserDetail(BaseModel):
    """Comprehensive user profile with multi-tenant memberships."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    status: UserStatus
    preferred_language: str
    is_platform_admin: bool
    is_verified: bool
    memberships: list[AdminMembershipDetail] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class AdminUserStatusUpdate(BaseModel):
    """Request payload for updating user account status."""

    status: UserStatus = Field(..., description="Target status: active, suspended, or terminated")
    reason: str | None = Field(None, description="Administrative reason for status change")


class AdminUserPlatformAdminToggle(BaseModel):
    """Request payload for toggling platform admin privileges."""

    is_platform_admin: bool = Field(..., description="Grant or revoke Super Admin privileges")
    reason: str | None = Field(None, description="Administrative reason for privilege modification")


class AdminUserResetPasswordRequest(BaseModel):
    """Request payload for administrative password reset."""

    new_password: str = Field(..., min_length=8, description="New secure password (min 8 characters)")
    reason: str | None = Field(None, description="Reason for password reset")
