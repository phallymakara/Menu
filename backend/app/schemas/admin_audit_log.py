from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AdminAuditLogItem(BaseModel):
    """Audit log item with enriched organization and user context."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Audit log unique identifier")
    organization_id: UUID | None = Field(None, description="Organization ID or None for platform/system events")
    organization_name: str | None = Field(None, description="Organization name")
    organization_slug: str | None = Field(None, description="Organization slug")
    user_id: UUID | None = Field(None, description="Acting user ID")
    user_name: str | None = Field(None, description="Acting user full name")
    user_email: str | None = Field(None, description="Acting user email")
    action: str = Field(..., description="Audit action string identifier")
    resource_type: str = Field(..., description="Target resource entity type")
    resource_id: str | None = Field(None, description="Target resource ID")
    ip_address: str | None = Field(None, description="Client IP address")
    user_agent: str | None = Field(None, description="Client User-Agent header")
    details: dict[str, Any] = Field(default_factory=dict, description="Metadata JSON payload")
    created_at: datetime = Field(..., description="Audit event timestamp")


class AdminAuditLogListResponse(BaseModel):
    """Paginated list response for Super Admin audit trail."""

    model_config = ConfigDict(from_attributes=True)

    items: list[AdminAuditLogItem] = Field(..., description="List of audit logs")
    total: int = Field(..., description="Total matching audit records")
    page: int = Field(1, description="Current page number")
    page_size: int = Field(50, description="Items per page")
    total_pages: int = Field(1, description="Total available pages")
