"""Sync payloads.

Each record carries its own `updated_at` and `deleted` flag — the two fields
last-write-wins reconciliation needs. Read shapes are reused from the budgeting
module so push/pull responses match the CRUD API.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.modules.budgeting.schemas import CategoryRead, EntryRead


class CategorySync(BaseModel):
    id: uuid.UUID
    name: str
    kind: Literal["income", "fixed", "variable"]
    position: int = 0
    updated_at: datetime
    deleted: bool = False


class EntrySync(BaseModel):
    id: uuid.UUID
    year: int
    month: int
    kind: Literal["income", "fixed", "variable", "goal"]
    category_id: uuid.UUID | None = None
    label: str = ""
    amount: float = 0.0
    currency: str = "EUR"
    updated_at: datetime
    deleted: bool = False


class PushRequest(BaseModel):
    categories: list[CategorySync] = []
    entries: list[EntrySync] = []


class PushResponse(BaseModel):
    # The authoritative server state for every pushed id, after LWW resolution,
    # so the client can overwrite its local copy where the server won.
    categories: list[CategoryRead]
    entries: list[EntryRead]
    server_time: datetime


class PullResponse(BaseModel):
    categories: list[CategoryRead]
    entries: list[EntryRead]
    server_time: datetime
