from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import StationType


class KitchenStationCreate(BaseModel):
    name_en: str = Field(..., min_length=1, max_length=100)
    name_km: str | None = Field(default=None, max_length=100)
    code: str = Field(..., min_length=1, max_length=30)
    station_type: StationType = Field(default=StationType.PREP_STATION)
    color_hex: str = Field(default="#3B82F6", max_length=10)
    display_order: int = Field(default=0, ge=0)
    is_active: bool = Field(default=True)


class KitchenStationUpdate(BaseModel):
    name_en: str | None = Field(default=None, min_length=1, max_length=100)
    name_km: str | None = Field(default=None, max_length=100)
    code: str | None = Field(default=None, min_length=1, max_length=30)
    station_type: StationType | None = None
    color_hex: str | None = Field(default=None, max_length=10)
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class KitchenStationResponse(BaseModel):
    id: UUID
    organization_id: UUID
    business_id: UUID
    branch_id: UUID
    name_en: str
    name_km: str | None = None
    code: str
    station_type: StationType
    color_hex: str
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StationItemAssignRequest(BaseModel):
    category_ids: list[UUID] = Field(default_factory=list)
    menu_item_ids: list[UUID] = Field(default_factory=list)
