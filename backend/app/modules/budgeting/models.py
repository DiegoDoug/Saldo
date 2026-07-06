"""Budgeting tables: Category and Entry.

Both are per-user and carry `created_at`/`updated_at` (last-write-wins sync in
Stage 5 depends on `updated_at`) and a soft-delete flag (`deleted`) so
offline clients can propagate deletions as tombstones instead of losing them.

Ids are UUIDs the client may generate offline, so a row created on-device keeps
the same id once it syncs to the server.

Semantic groups live on `kind`:
  - Category.kind ∈ {income, fixed, variable}
  - Entry.kind    ∈ {income, fixed, variable, goal}
A "goal" entry carries the month's savings goal and has no category.
"""

import uuid
from datetime import UTC, datetime

from sqlmodel import Field, SQLModel

CATEGORY_KINDS = ("income", "fixed", "variable")
ENTRY_KINDS = ("income", "fixed", "variable", "goal")


def utcnow() -> datetime:
    # Naive UTC: SQLite stores datetimes without tz and reads them back naive,
    # so keeping the in-memory value naive-UTC too means an object and its
    # reloaded copy compare consistently — which the sync last-write-wins
    # comparison in Stage 5 relies on.
    return datetime.now(UTC).replace(tzinfo=None)


class Category(SQLModel, table=True):
    __tablename__ = "category"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    name: str = Field(max_length=120)
    kind: str = Field(max_length=16)  # one of CATEGORY_KINDS
    position: int = Field(default=0)  # display ordering within its kind

    # Nesting: a subcategory points at its parent. A child inherits `kind` from
    # its root, so every category in a tree shares one kind. `None` = a root.
    parent_id: uuid.UUID | None = Field(
        default=None, foreign_key="category.id", index=True
    )
    color: str | None = Field(default=None, max_length=9)  # hex, e.g. #6EE7B7
    icon: str | None = Field(default=None, max_length=40)  # lucide icon name

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)


class Entry(SQLModel, table=True):
    __tablename__ = "entry"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    year: int = Field(index=True)
    month: int = Field(index=True)  # 0-11, matching the prototype/frontend
    kind: str = Field(max_length=16)  # one of ENTRY_KINDS

    # Expense lines reference a Category; income/goal lines may not.
    category_id: uuid.UUID | None = Field(default=None, foreign_key="category.id")
    label: str = Field(default="", max_length=120)

    amount: float = Field(default=0.0)
    currency: str = Field(default="EUR", max_length=3)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)
