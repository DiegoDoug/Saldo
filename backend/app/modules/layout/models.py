"""WidgetLayout table: one JSON blob per user."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

from app.modules.budgeting.models import utcnow


class WidgetLayout(SQLModel, table=True):
    __tablename__ = "widget_layout"

    # user_id is the primary key -> exactly one layout row per user.
    user_id: uuid.UUID = Field(foreign_key="user.id", primary_key=True)
    data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=utcnow)
