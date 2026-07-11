"""AI provider interface for bank-statement parsing.

Business logic (`draft_builder.py`, `pipeline.py`) depends only on this Protocol
and the `RawBankExtraction`/`BankExtractionContext` schemas below — never on
DeepSeek's request/response shape. Adding OpenAI/Gemini/Claude/a local model
later is a new file implementing `BankExtractionProvider` plus one line in
`dependency.py`, exactly the same seam `receipt_import/ai/base.py` uses.

The context carries the user's own accounts, categories, merchants and tags so
the model can match a statement row to an existing entity (returning its id)
instead of always proposing a new one — the same "matching rides in the
extraction call" idea as receipt import, extended to accounts.
"""

import uuid
from datetime import date
from typing import Protocol

from pydantic import BaseModel, Field


class AccountHint(BaseModel):
    id: uuid.UUID
    name: str
    currency: str
    type: str


class CategoryHint(BaseModel):
    id: uuid.UUID
    name: str
    kind: str


class MerchantHint(BaseModel):
    id: uuid.UUID
    name: str


class TagHint(BaseModel):
    name: str


class BankExtractionContext(BaseModel):
    today: date
    default_currency: str
    accounts: list[AccountHint] = Field(default_factory=list)
    categories: list[CategoryHint] = Field(default_factory=list)
    merchants: list[MerchantHint] = Field(default_factory=list)
    tags: list[TagHint] = Field(default_factory=list)


class RawMovement(BaseModel):
    """One parsed statement row (a proposed `movimiento`).

    `amount` is always a positive magnitude; `type` carries the sign, matching
    the `Transaction` model's own convention (see transactions/models.py).
    """

    date: str | None = None  # ISO 8601 YYYY-MM-DD
    description: str | None = None
    type: str = "expense"  # income | expense | transfer
    amount: float | None = None
    currency: str | None = None
    account_id: uuid.UUID | None = None  # existing account this row belongs to
    account_name: str | None = None  # else a proposed account name
    # For a transfer only: the *other* account the money moves to/from.
    transfer_account_id: uuid.UUID | None = None
    transfer_account_name: str | None = None
    category_id: uuid.UUID | None = None
    category_name: str | None = None  # proposed new category, only if no id
    merchant_id: uuid.UUID | None = None
    merchant_name: str | None = None  # proposed new merchant, only if no id
    tags: list[str] = Field(default_factory=list)
    is_recurring: bool = False  # candidate for a `recibo` (recurring rule)
    notes: str | None = None
    confidence: float | None = None


class ProposedEntity(BaseModel):
    """A new account/category/merchant/tag the statement implies but the user
    doesn't have yet. `kind` disambiguates categories (income/fixed/variable)
    and account types; ignored for merchants/tags."""

    name: str
    kind: str | None = None


class RawBankExtraction(BaseModel):
    bank_name: str | None = None
    currency: str | None = None
    movements: list[RawMovement] = Field(default_factory=list)
    new_accounts: list[ProposedEntity] = Field(default_factory=list)
    new_categories: list[ProposedEntity] = Field(default_factory=list)
    new_merchants: list[ProposedEntity] = Field(default_factory=list)
    new_tags: list[ProposedEntity] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    overall_confidence: float | None = None


class BankExtractionProvider(Protocol):
    async def extract(
        self, file_text: str, context: BankExtractionContext
    ) -> RawBankExtraction: ...
