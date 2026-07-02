"""Request/response schemas for the transactions API.

`TransactionCreate` accepts an optional client-supplied `id` so a transaction
created offline in Dexie keeps its id when it first reaches the server.
"""

import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

TransactionType = Literal["income", "expense", "transfer"]
SortField = Literal["date", "amount", "created_at"]
SortOrder = Literal["asc", "desc"]


class TransactionCreate(BaseModel):
    id: uuid.UUID | None = None
    type: TransactionType
    amount: float
    currency: str = "EUR"
    account_id: uuid.UUID
    transfer_account_id: uuid.UUID | None = None
    merchant_id: uuid.UUID | None = None
    recurring_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    date: date_type
    notes: str = ""
    tags: list[str] = []


class TransactionUpdate(BaseModel):
    type: TransactionType | None = None
    amount: float | None = None
    currency: str | None = None
    account_id: uuid.UUID | None = None
    transfer_account_id: uuid.UUID | None = None
    merchant_id: uuid.UUID | None = None
    recurring_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    date: date_type | None = None
    notes: str | None = None
    tags: list[str] | None = None


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    amount: float
    currency: str
    account_id: uuid.UUID
    transfer_account_id: uuid.UUID | None
    merchant_id: uuid.UUID | None
    recurring_id: uuid.UUID | None
    category_id: uuid.UUID | None
    date: date_type
    notes: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    deleted: bool


class TransactionPage(BaseModel):
    """A page of results plus the total match count for the same filters."""

    items: list[TransactionRead]
    total: int
    limit: int
    offset: int


# --- Bulk actions -------------------------------------------------------
BulkAction = Literal["delete", "set_category", "add_tag"]


class BulkRequest(BaseModel):
    ids: list[uuid.UUID]
    action: BulkAction
    category_id: uuid.UUID | None = None  # for set_category
    tag: str | None = None  # for add_tag


class BulkResponse(BaseModel):
    affected: int


# --- Transfer helper ----------------------------------------------------
class TransferCreate(BaseModel):
    id: uuid.UUID | None = None
    amount: float
    currency: str = "EUR"
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    date: date_type
    notes: str = ""
    tags: list[str] = []
