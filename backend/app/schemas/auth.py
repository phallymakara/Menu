from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

# Password policy shared by registration and password reset.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


class OwnerRegistrationRequest(BaseModel):
    email: EmailStr | None = None
    phone: str | None = Field(
        default=None,
        min_length=8,
        max_length=30,
        description="Optional contact phone number",
    )

    password: str = Field(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description="Secure password (minimum 8 characters)",
    )

    full_name: str = Field(
        min_length=2,
        max_length=150,
        description="Owner full name",
    )

    organization_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=150,
        description="Optional company/brand name. Defaults to '{full_name}'s Business'",
    )

    organization_slug: str | None = Field(
        default=None,
        min_length=2,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
        description="Optional URL slug. Auto-generated if not provided.",
    )

    business_name_en: str | None = Field(
        default=None,
        min_length=2,
        max_length=150,
        description="Optional initial brand name (defaults to organization name)",
    )

    business_name_km: str | None = Field(
        default=None,
        max_length=150,
        description="Optional Khmer brand name",
    )

    business_type: str = Field(
        default="Restaurant",
        min_length=2,
        max_length=50,
        description="Type of business (e.g. Restaurant, Café, Bar)",
    )

    branch_name_en: str = Field(
        default="Main Branch",
        min_length=2,
        max_length=150,
        description="Name of the initial physical location",
    )

    branch_name_km: str | None = Field(
        default=None,
        max_length=150,
        description="Optional Khmer branch name",
    )

    branch_code: str = Field(
        default="MAIN",
        min_length=1,
        max_length=50,
        description="Short branch code identifier",
    )

    @model_validator(mode="after")
    def validate_contact(self) -> "OwnerRegistrationRequest":
        if self.email is None and self.phone is None:
            raise ValueError("Either email or phone is required.")

        return self


class OwnerRegistrationResponse(BaseModel):
    user_id: str
    organization_id: str
    business_id: str
    branch_id: str
    message: str
    access_token: str | None = None
    token_type: str = "bearer"
    refresh_token: str | None = Field(
        default=None,
        description="Opaque refresh token for POST /auth/refresh and /auth/logout",
    )


class LoginRequest(BaseModel):
    identifier: str = Field(
        min_length=3,
        max_length=255,
        description="Email address or Cambodian phone number",
    )

    password: str = Field(
        min_length=8,
        max_length=128,
    )


class AccessTokenResponse(BaseModel):
    """Tokens returned by login and refresh."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Access token lifetime in seconds")
    refresh_token: str = Field(
        description=(
            "Opaque, single-use refresh token. Exchange it at POST /auth/refresh for "
            "a new token pair, or revoke the session with POST /auth/logout."
        ),
    )


class RefreshTokenRequest(BaseModel):
    """A refresh token presented to rotate or revoke a session."""

    refresh_token: str = Field(min_length=20, max_length=512)


class PasswordResetRequest(BaseModel):
    """Start a password reset for the account with this email or phone number."""

    identifier: str = Field(
        min_length=3,
        max_length=255,
        description="Email address or Cambodian phone number",
    )


class PasswordResetRequestResponse(BaseModel):
    """
    Identical for every request, whether or not an account matched.

    ``debug_reset_token`` is only ever set when ENVIRONMENT is 'development', so the
    flow can be tested before an email or SMS provider is configured.
    """

    message: str
    debug_reset_token: str | None = None


class PasswordResetConfirmRequest(BaseModel):
    """Redeem a password reset token and set a new password."""

    token: str = Field(min_length=20, max_length=512)
    new_password: str = Field(
        min_length=PASSWORD_MIN_LENGTH,
        max_length=PASSWORD_MAX_LENGTH,
        description="New password (minimum 8 characters)",
    )


class MessageResponse(BaseModel):
    """A human-readable confirmation message."""

    message: str


class MembershipResponse(BaseModel):
    membership_id: UUID
    organization_id: UUID
    organization_name: str
    organization_slug: str
    job_title: str | None
    is_owner: bool


class CurrentUserResponse(BaseModel):
    user_id: UUID
    email: str | None
    phone: str | None
    full_name: str
    preferred_language: str
    is_platform_admin: bool
    memberships: list[MembershipResponse]
