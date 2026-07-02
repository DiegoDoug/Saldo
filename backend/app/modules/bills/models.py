"""Recurring rules (a.k.a. bills / subscriptions).

A rule is a *template* for transactions that repeat on a schedule. Materializing
a rule creates real `Transaction` rows (each tagged with `recurring_id`) using a
deterministic id per occurrence (see `app.shared.domain.recurring`), so the same
occurrence generated on two devices collapses to one transaction under
last-write-wins sync.

Carries the standard sync envelope (client-generated UUID id, `user_id` scope,
`created_at`/`updated_at`, `deleted` tombstone).

`next_run` is the cursor: the next occurrence date not yet materialized. Advancing
it as occurrences are generated is what makes materialization idempotent.
"""

import uuid
from datetime import date as date_type
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.budgeting.models import utcnow

FREQUENCIES = ("daily", "weekly", "biweekly", "monthly", "quarterly", "yearly")


class RecurringRule(SQLModel, table=True):
    __tablename__ = "recurring_rule"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    name: str = Field(max_length=120)

    # Transaction template
    type: str = Field(max_length=16)  # income | expense | transfer
    amount: float = Field(default=0.0)
    currency: str = Field(default="EUR", max_length=3)
    account_id: uuid.UUID = Field(foreign_key="account.id", index=True)
    transfer_account_id: uuid.UUID | None = Field(default=None, foreign_key="account.id")
    merchant_id: uuid.UUID | None = Field(default=None, index=True)
    category_id: uuid.UUID | None = Field(default=None, foreign_key="category.id")
    notes: str = Field(default="", max_length=500)

    # Schedule
    frequency: str = Field(max_length=16)  # one of FREQUENCIES
    interval: int = Field(default=1)  # every N periods
    start_date: date_type = Field(index=True)
    end_date: date_type | None = Field(default=None)
    next_run: date_type = Field(index=True)
    auto_generate: bool = Field(default=True)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)
