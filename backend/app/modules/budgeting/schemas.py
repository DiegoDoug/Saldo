"""Request/response schemas for the budgeting API.

Create schemas accept an optional client-supplied `id` so an entity created
offline in Dexie keeps its id when it first reaches the server.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

CategoryKind = Literal["income", "fixed", "variable"]
EntryKind = Literal["income", "fixed", "variable", "goal"]


# --- Category -----------------------------------------------------------
class CategoryCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str
    kind: CategoryKind
    position: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = None
    kind: CategoryKind | None = None
    position: int | None = None


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    position: int
    created_at: datetime
    updated_at: datetime
    deleted: bool


# --- Entry --------------------------------------------------------------
class EntryCreate(BaseModel):
    id: uuid.UUID | None = None
    year: int
    month: int  # 0-11
    kind: EntryKind
    category_id: uuid.UUID | None = None
    label: str = ""
    amount: float = 0.0
    currency: str = "EUR"


class EntryUpdate(BaseModel):
    year: int | None = None
    month: int | None = None
    kind: EntryKind | None = None
    category_id: uuid.UUID | None = None
    label: str | None = None
    amount: float | None = None
    currency: str | None = None


class EntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    year: int
    month: int
    kind: str
    category_id: uuid.UUID | None
    label: str
    amount: float
    currency: str
    created_at: datetime
    updated_at: datetime
    deleted: bool


# --- Summaries ----------------------------------------------------------
class MonthSummary(BaseModel):
    year: int
    month: int
    income_total: float
    extras_total: float
    fixed_total: float
    variable_total: float
    expenses_total: float
    goal: float
    can_spend: float
    end_of_month_savings: float
    remaining_to_spend: float
    met_goal: bool
    overspend: bool


class YearSummary(BaseModel):
    year: int
    income_total: float
    goal_total: float
    can_spend_total: float
    expenses_total: float
    fixed_total: float
    variable_total: float
    savings_total: float
    nomina_total: float
    otros_total: float
    per_month: list[MonthSummary]
