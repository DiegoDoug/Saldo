"""Request/response schemas for the goals API."""

import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

GoalKind = Literal["emergency", "vacation", "house", "car", "custom"]


class GoalCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str
    kind: GoalKind = "custom"
    target_amount: float
    current_amount: float = 0.0
    monthly_contribution: float = 0.0
    currency: str = "EUR"
    target_date: date_type | None = None


class GoalUpdate(BaseModel):
    name: str | None = None
    kind: GoalKind | None = None
    target_amount: float | None = None
    current_amount: float | None = None
    monthly_contribution: float | None = None
    currency: str | None = None
    target_date: date_type | None = None


class GoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    target_amount: float
    current_amount: float
    monthly_contribution: float
    currency: str
    target_date: date_type | None
    created_at: datetime
    updated_at: datetime
    deleted: bool


class GoalProjection(BaseModel):
    """Derived figures for a goal (computed by the domain core)."""

    goal_id: uuid.UUID
    progress: float  # 0..1
    remaining_amount: float
    months_remaining: int | None  # None → unreachable at current contribution
    estimated_completion_date: date_type | None


class ContributeRequest(BaseModel):
    amount: float
