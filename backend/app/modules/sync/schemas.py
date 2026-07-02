"""Sync payloads.

Each record carries its own `updated_at` and `deleted` flag — the two fields
last-write-wins reconciliation needs. Read shapes are reused from the budgeting
module so push/pull responses match the CRUD API.
"""

import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.modules.accounts.schemas import AccountRead
from app.modules.budgeting.schemas import CategoryRead, EntryRead
from app.modules.transactions.schemas import TransactionRead


class AccountSync(BaseModel):
    id: uuid.UUID
    name: str
    type: Literal[
        "checking", "savings", "cash", "credit_card", "investment", "crypto"
    ]
    currency: str = "EUR"
    opening_balance: float = 0.0
    color: str = ""
    icon: str = ""
    position: int = 0
    archived: bool = False
    updated_at: datetime
    deleted: bool = False


class TransactionSync(BaseModel):
    id: uuid.UUID
    type: Literal["income", "expense", "transfer"]
    amount: float = 0.0
    currency: str = "EUR"
    account_id: uuid.UUID
    transfer_account_id: uuid.UUID | None = None
    merchant_id: uuid.UUID | None = None
    recurring_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    date: date_type
    notes: str = ""
    tags: list[str] = []
    updated_at: datetime
    deleted: bool = False


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
    accounts: list[AccountSync] = []
    transactions: list[TransactionSync] = []
    categories: list[CategorySync] = []
    entries: list[EntrySync] = []


class PushResponse(BaseModel):
    # The authoritative server state for every pushed id, after LWW resolution,
    # so the client can overwrite its local copy where the server won.
    accounts: list[AccountRead] = []
    transactions: list[TransactionRead] = []
    categories: list[CategoryRead]
    entries: list[EntryRead]
    server_time: datetime


class PullResponse(BaseModel):
    accounts: list[AccountRead] = []
    transactions: list[TransactionRead] = []
    categories: list[CategoryRead]
    entries: list[EntryRead]
    server_time: datetime
