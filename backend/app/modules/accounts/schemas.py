"""Request/response schemas for the accounts API.

`AccountCreate` accepts an optional client-supplied `id` so an account created
offline in Dexie keeps its id when it first reaches the server (same convention
as budgeting).
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

AccountType = Literal[
    "checking", "savings", "cash", "credit_card", "investment", "crypto"
]


class AccountCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str
    type: AccountType
    currency: str = "EUR"
    opening_balance: float = 0.0
    color: str = ""
    icon: str = ""
    position: int = 0
    archived: bool = False


class AccountUpdate(BaseModel):
    name: str | None = None
    type: AccountType | None = None
    currency: str | None = None
    opening_balance: float | None = None
    color: str | None = None
    icon: str | None = None
    position: int | None = None
    archived: bool | None = None


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: str
    currency: str
    opening_balance: float
    color: str
    icon: str
    position: int
    archived: bool
    created_at: datetime
    updated_at: datetime
    deleted: bool


class AccountBalance(BaseModel):
    account_id: uuid.UUID
    currency: str
    opening_balance: float
    # Signed sum of transactions on this account (income +, expense -, transfers
    # both legs), already added onto the opening balance.
    balance: float


class BalancesResponse(BaseModel):
    accounts: list[AccountBalance]
    # Naive total per currency (no FX): callers that need a single-number total
    # convert client-side or via the FX provider on a dedicated report.
    totals_by_currency: dict[str, float]
