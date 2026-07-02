"""Accounts table.

A financial account (checking, savings, cash, credit card, investment, crypto)
that transactions belong to. Like every syncable table it carries the sync
envelope — client-generated UUID id, `user_id` scope, `created_at`/`updated_at`
for last-write-wins, and a `deleted` tombstone flag — so it round-trips through
`/sync/push` and `/sync/pull` identically to Category/Entry.

The stored balance is only the `opening_balance`; the *current* balance is
derived by folding signed transactions on top of it (see the accounts service).
"""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.budgeting.models import utcnow

# Kinds of account. Kept as a plain tuple (mirrors CATEGORY_KINDS) rather than an
# enum column so it stays trivially syncable and forkable.
ACCOUNT_TYPES = (
    "checking",
    "savings",
    "cash",
    "credit_card",
    "investment",
    "crypto",
)


class Account(SQLModel, table=True):
    __tablename__ = "account"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    name: str = Field(max_length=120)
    type: str = Field(max_length=16)  # one of ACCOUNT_TYPES
    currency: str = Field(default="EUR", max_length=3)
    opening_balance: float = Field(default=0.0)

    color: str = Field(default="", max_length=32)
    icon: str = Field(default="", max_length=32)
    position: int = Field(default=0)  # display ordering
    archived: bool = Field(default=False)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)
