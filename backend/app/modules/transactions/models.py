"""Transactions table — the primary financial ledger.

A transaction is `income`, `expense`, or `transfer`. `amount` is always stored
as a positive magnitude; the sign each account sees is derived from `type` (see
`app.modules.transactions.service.account_deltas`):

  income   → +amount on account_id
  expense  → -amount on account_id
  transfer → -amount on account_id, +amount on transfer_account_id

Like every syncable table it carries the sync envelope (client-generated UUID
id, `user_id` scope, `created_at`/`updated_at`, `deleted` tombstone).

`merchant_id` and `recurring_id` are deliberately plain nullable UUIDs (no FK
constraint) because the merchants and recurring-rule tables are later slices;
adding the constraints then is a purely additive migration. `category_id` and
`account_id`/`transfer_account_id` reference tables that already exist and carry
real FKs.
"""

import uuid
from datetime import date as date_type
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Column, Field, SQLModel

from app.modules.budgeting.models import utcnow

TRANSACTION_TYPES = ("income", "expense", "transfer")


class Transaction(SQLModel, table=True):
    __tablename__ = "transaction"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    type: str = Field(max_length=16, index=True)  # one of TRANSACTION_TYPES
    amount: float = Field(default=0.0)  # positive magnitude
    currency: str = Field(default="EUR", max_length=3)

    account_id: uuid.UUID = Field(foreign_key="account.id", index=True)
    # Destination account for transfers; null for income/expense.
    transfer_account_id: uuid.UUID | None = Field(
        default=None, foreign_key="account.id", index=True
    )

    # Soft references filled in by later slices (no FK yet — see module docstring).
    merchant_id: uuid.UUID | None = Field(default=None, index=True)
    recurring_id: uuid.UUID | None = Field(default=None, index=True)

    category_id: uuid.UUID | None = Field(
        default=None, foreign_key="category.id", index=True
    )

    # Splits: a `split_parent` row carries the total (plus account/type/date/note)
    # but is excluded from every money sum; its child rows (`parent_id` set) are
    # the leaves that actually count, each with its own category and amount.
    # Modeling splits as child transactions reuses all the transaction machinery.
    split_parent: bool = Field(default=False, index=True)
    parent_id: uuid.UUID | None = Field(
        default=None, foreign_key="transaction.id", index=True
    )

    date: date_type = Field(index=True)
    notes: str = Field(default="", max_length=500)
    # JSON array of free-form tag strings.
    tags: list[str] = Field(default_factory=list, sa_column=Column(sa.JSON))

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)
