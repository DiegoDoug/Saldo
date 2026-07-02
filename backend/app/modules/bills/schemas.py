"""Request/response schemas for the recurring rules / bills API."""

import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TransactionType = Literal["income", "expense", "transfer"]
Frequency = Literal["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]


class RecurringRuleCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str
    type: TransactionType
    amount: float
    currency: str = "EUR"
    account_id: uuid.UUID
    transfer_account_id: uuid.UUID | None = None
    merchant_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    notes: str = ""
    frequency: Frequency
    interval: int = Field(default=1, ge=1)
    start_date: date_type
    end_date: date_type | None = None
    # Defaults to start_date when omitted (see the router).
    next_run: date_type | None = None
    auto_generate: bool = True


class RecurringRuleUpdate(BaseModel):
    name: str | None = None
    type: TransactionType | None = None
    amount: float | None = None
    currency: str | None = None
    account_id: uuid.UUID | None = None
    transfer_account_id: uuid.UUID | None = None
    merchant_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    notes: str | None = None
    frequency: Frequency | None = None
    interval: int | None = Field(default=None, ge=1)
    start_date: date_type | None = None
    end_date: date_type | None = None
    next_run: date_type | None = None
    auto_generate: bool | None = None


class RecurringRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: str
    amount: float
    currency: str
    account_id: uuid.UUID
    transfer_account_id: uuid.UUID | None
    merchant_id: uuid.UUID | None
    category_id: uuid.UUID | None
    notes: str
    frequency: str
    interval: int
    start_date: date_type
    end_date: date_type | None
    next_run: date_type
    auto_generate: bool
    created_at: datetime
    updated_at: datetime
    deleted: bool


class UpcomingBill(BaseModel):
    """A projected (not-yet-materialized) occurrence of a rule."""

    rule_id: uuid.UUID
    occurrence_id: uuid.UUID  # deterministic id the transaction would get
    name: str
    type: str
    amount: float
    currency: str
    account_id: uuid.UUID
    category_id: uuid.UUID | None
    merchant_id: uuid.UUID | None
    date: date_type


class MaterializeResponse(BaseModel):
    created: int
    next_run: date_type
