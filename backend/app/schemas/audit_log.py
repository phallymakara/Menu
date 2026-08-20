from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    """Response schema for a single audit log entry."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID | None = None
    user_id: UUID | None = None
    action: str
    resource_type: str | None = None
    resource_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    details: dict[str, Any] = {}
    created_at: datetime


class AuditLogPaginationResponse(BaseModel):
    """Paginated list of audit logs."""

    items: list[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
