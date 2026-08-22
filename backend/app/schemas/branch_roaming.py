from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class SwitchBranchRequest(BaseModel):
    """Payload to switch active working branch context."""

    branch_id: UUID = Field(description="Target branch ID to switch to")


class SwitchBranchResponse(BaseModel):
    """Response containing refreshed JWT with active_branch_id claim."""

    access_token: str
    token_type: str = "bearer"
    active_branch_id: UUID
    branch_name_en: str
    branch_code: str
    role: str
    is_owner: bool


class AccessibleBranchInfo(BaseModel):
    """Details of a branch accessible to the user."""

    branch_id: UUID
    branch_name_en: str
    branch_name_km: str | None = None
    branch_code: str
    address: str | None = None
    role: str
    is_owner: bool
    is_home_branch: bool
    is_active_branch: bool


class MyBranchesResponse(BaseModel):
    """List of all branches accessible to the authenticated staff member."""

    can_switch_branches: bool = Field(
        description="True for Brand Owners and General Managers; False for branch-locked staff",
    )
    active_branch_id: UUID | None
    branches: list[AccessibleBranchInfo]
