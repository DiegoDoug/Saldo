"""Schemas for the layout endpoints."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class LayoutRead(BaseModel):
    data: dict[str, Any]
    updated_at: datetime


class LayoutWrite(BaseModel):
    data: dict[str, Any]
    # Optional client timestamp for last-write-wins; server time is used if absent.
    updated_at: datetime | None = None
