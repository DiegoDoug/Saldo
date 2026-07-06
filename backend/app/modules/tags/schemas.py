"""Request/response schemas for the tags API.

`TagCreate` accepts an optional client-supplied `id` so a tag created offline in
Dexie keeps its id when it first reaches the server.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str
    color: str = ""


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color: str
    created_at: datetime
    updated_at: datetime
    deleted: bool
