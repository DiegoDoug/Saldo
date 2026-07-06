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
from app.modules.bills.schemas import RecurringRuleRead
from app.modules.budgeting.schemas import CategoryRead, EntryRead
from app.modules.goals.schemas import GoalRead
from app.modules.merchants.schemas import MerchantRead
from app.modules.networth.schemas import AssetRead, LiabilityRead, SnapshotRead
from app.modules.tags.schemas import TagRead
from app.modules.transactions.schemas import TransactionRead


class AssetSync(BaseModel):
    id: uuid.UUID
    name: str
    kind: Literal["cash", "property", "vehicle", "investment", "crypto", "other"]
    value: float = 0.0
    currency: str = "EUR"
    updated_at: datetime
    deleted: bool = False


class LiabilitySync(BaseModel):
    id: uuid.UUID
    name: str
    kind: Literal["mortgage", "loan", "credit_card", "student", "other"]
    balance: float = 0.0
    currency: str = "EUR"
    interest_rate: float = 0.0
    updated_at: datetime
    deleted: bool = False


class SnapshotSync(BaseModel):
    id: uuid.UUID
    date: date_type
    assets_total: float = 0.0
    liabilities_total: float = 0.0
    net_worth: float = 0.0
    currency: str = "EUR"
    updated_at: datetime
    deleted: bool = False


class GoalSync(BaseModel):
    id: uuid.UUID
    name: str
    kind: Literal["emergency", "vacation", "house", "car", "custom"]
    target_amount: float = 0.0
    current_amount: float = 0.0
    monthly_contribution: float = 0.0
    currency: str = "EUR"
    target_date: date_type | None = None
    updated_at: datetime
    deleted: bool = False


class RecurringRuleSync(BaseModel):
    id: uuid.UUID
    name: str
    type: Literal["income", "expense", "transfer"]
    amount: float = 0.0
    currency: str = "EUR"
    account_id: uuid.UUID
    transfer_account_id: uuid.UUID | None = None
    merchant_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    notes: str = ""
    frequency: Literal["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]
    interval: int = 1
    start_date: date_type
    end_date: date_type | None = None
    next_run: date_type
    auto_generate: bool = True
    updated_at: datetime
    deleted: bool = False


class MerchantSync(BaseModel):
    id: uuid.UUID
    name: str
    logo: str = ""
    color: str = ""
    category_id: uuid.UUID | None = None
    website: str = ""
    location: str = ""
    recurring_probability: float = 0.0
    updated_at: datetime
    deleted: bool = False


class TagSync(BaseModel):
    id: uuid.UUID
    name: str
    color: str = ""
    updated_at: datetime
    deleted: bool = False


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
    split_parent: bool = False
    parent_id: uuid.UUID | None = None
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
    parent_id: uuid.UUID | None = None
    color: str | None = None
    icon: str | None = None
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
    merchants: list[MerchantSync] = []
    recurring_rules: list[RecurringRuleSync] = []
    goals: list[GoalSync] = []
    assets: list[AssetSync] = []
    liabilities: list[LiabilitySync] = []
    snapshots: list[SnapshotSync] = []
    categories: list[CategorySync] = []
    entries: list[EntrySync] = []
    tags: list[TagSync] = []


class PushResponse(BaseModel):
    # The authoritative server state for every pushed id, after LWW resolution,
    # so the client can overwrite its local copy where the server won.
    accounts: list[AccountRead] = []
    transactions: list[TransactionRead] = []
    merchants: list[MerchantRead] = []
    recurring_rules: list[RecurringRuleRead] = []
    goals: list[GoalRead] = []
    assets: list[AssetRead] = []
    liabilities: list[LiabilityRead] = []
    snapshots: list[SnapshotRead] = []
    categories: list[CategoryRead]
    entries: list[EntryRead]
    tags: list[TagRead] = []
    server_time: datetime


class PullResponse(BaseModel):
    accounts: list[AccountRead] = []
    transactions: list[TransactionRead] = []
    merchants: list[MerchantRead] = []
    recurring_rules: list[RecurringRuleRead] = []
    goals: list[GoalRead] = []
    assets: list[AssetRead] = []
    liabilities: list[LiabilityRead] = []
    snapshots: list[SnapshotRead] = []
    categories: list[CategoryRead]
    entries: list[EntryRead]
    tags: list[TagRead] = []
    server_time: datetime
