from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


class OwnerRegistrationRequest(BaseModel):
    email: EmailStr | None = None
    phone: str | None = Field(
        default=None,
        min_length=8,
        max_length=30,
    )

    password: str = Field(
        min_length=8,
        max_length=128,
    )

    full_name: str = Field(
        min_length=2,
        max_length=150,
    )

    organization_name: str = Field(
        min_length=2,
        max_length=150,
    )

    organization_slug: str = Field(
        min_length=2,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )

    business_name_en: str = Field(
        min_length=2,
        max_length=150,
    )

    business_name_km: str | None = Field(
        default=None,
        max_length=150,
    )

    business_type: str = Field(
        min_length=2,
        max_length=50,
    )

    branch_name_en: str = Field(
        min_length=2,
        max_length=150,
    )

    branch_name_km: str | None = Field(
        default=None,
        max_length=150,
    )

    branch_code: str = Field(
        min_length=1,
        max_length=50,
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
    access_token: str
    token_type: str = "bearer"
    expires_in: int


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
