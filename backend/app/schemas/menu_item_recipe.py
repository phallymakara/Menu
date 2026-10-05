"""Request and response DTOs for menu item recipes (bill of materials)."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.enums import UnitOfMeasure

MAX_RECIPE_LINES = 100


class RecipeLineInput(BaseModel):
    """One ingredient line of a recipe replacement request."""

    inventory_item_id: UUID
    variant_id: UUID | None = Field(
        default=None,
        description=(
            "Variant this line applies to. Omit or null to apply it to every "
            "variant; a variant-specific line overrides the all-variants line "
            "for the same inventory item."
        ),
    )
    quantity: Decimal = Field(
        ...,
        gt=0,
        max_digits=12,
        decimal_places=2,
        description=(
            "Amount used to make one unit of the menu item, in the inventory "
            "item's own unit of measure. Branch stock is tracked to 2 decimal "
            "places, so use a smaller unit (g, ml) for finer amounts."
        ),
    )


class MenuItemRecipeReplaceRequest(BaseModel):
    """Full recipe for a menu item; replaces every existing line atomically."""

    lines: list[RecipeLineInput] = Field(
        default_factory=list,
        max_length=MAX_RECIPE_LINES,
        description="The complete recipe. An empty list clears the recipe.",
    )

    @model_validator(mode="after")
    def _reject_duplicate_lines(self) -> "MenuItemRecipeReplaceRequest":
        """Rejects two lines for the same inventory item and variant scope."""
        seen: set[tuple[UUID | None, UUID]] = set()
        for line in self.lines:
            key = (line.variant_id, line.inventory_item_id)
            if key in seen:
                raise ValueError(
                    "Each inventory item may appear only once per variant scope "
                    f"(duplicate inventory_item_id {line.inventory_item_id})."
                )
            seen.add(key)
        return self


class RecipeLineResponse(BaseModel):
    """One ingredient line of a menu item recipe."""

    id: UUID
    inventory_item_id: UUID
    inventory_item_name_en: str
    inventory_item_name_km: str | None = None
    unit_of_measure: UnitOfMeasure
    variant_id: UUID | None = None
    variant_name_en: str | None = None
    quantity: Decimal
    cost_per_unit_usd: Decimal = Field(
        description="Current unit cost of the inventory item (not a snapshot)."
    )
    created_at: datetime
    updated_at: datetime


class MenuItemRecipeResponse(BaseModel):
    """The full recipe (bill of materials) of a menu item."""

    menu_item_id: UUID
    business_id: UUID
    lines: list[RecipeLineResponse] = Field(default_factory=list)
