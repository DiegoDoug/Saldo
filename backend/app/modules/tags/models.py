"""Tags table — a per-user registry of named, colourable labels.

A transaction's *membership* in tags stays on `Transaction.tags` (a JSON array of
tag names) — that already round-trips through sync as a plain field. This table
is the **registry**: it gives each tag name a stable colour and a manageable
identity (rename/recolor/delete), without a separate membership join table.

Like every syncable table it carries the sync envelope (client-generated UUID
id, `user_id` scope, `created_at`/`updated_at`, `deleted` tombstone).
"""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.budgeting.models import utcnow


class Tag(SQLModel, table=True):
    __tablename__ = "tag"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    name: str = Field(max_length=60, index=True)
    color: str = Field(default="", max_length=9)  # hex, e.g. #6EE7B7

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)
