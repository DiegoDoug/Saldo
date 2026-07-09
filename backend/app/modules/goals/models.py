"""Savings goals.

A goal tracks progress toward a target amount (emergency fund, vacation, house,
car, or a custom goal). Projections — progress, months remaining, estimated
completion date — are derived by the framework-free core in
`app.shared.domain.goals`; this table only stores the inputs.

Carries the standard sync envelope (client-generated UUID id, `user_id` scope,
`created_at`/`updated_at`, `deleted` tombstone).
"""

import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.modules.budgeting.models import utcnow

GOAL_KINDS = ("emergency", "vacation", "house", "car", "custom")


class Goal(SQLModel, table=True):
    __tablename__ = "goal"
    # Sync pulls filter by user AND updated_at; see migration f5a6b7c8d9e0.
    __table_args__ = (Index("ix_goal_user_updated", "user_id", "updated_at"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    name: str = Field(max_length=120)
    kind: str = Field(max_length=16)  # one of GOAL_KINDS
    target_amount: float = Field(default=0.0)
    current_amount: float = Field(default=0.0)
    monthly_contribution: float = Field(default=0.0)
    currency: str = Field(default="EUR", max_length=3)
    target_date: date_type | None = Field(default=None)  # optional user deadline

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)
