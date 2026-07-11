"""Request/response schemas for the bank-import API.

`DraftBankAnalysis` is the contract the AI pipeline produces and the frontend
review screen renders. Like receipt import, none of this is written into ledger
tables by the backend — it is only ever a draft the user reviews and edits
before the `movimientos`/`cuentas`/`categorias`/`comercios`/`etiquetas`/`recibos`
are created client-side in Dexie. See `models.py` for why this table sits
outside the sync protocol.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BankImportStatus = Literal[
    "uploaded", "processing", "ready", "failed", "confirmed", "discarded"
]


class DraftMovement(BaseModel):
    """One proposed `movimiento`, already reconciled against the user's data.

    `account_ref`/`category_ref`/`merchant_ref` name a *new* entity to create;
    the `*_id` fields point at an existing one. Exactly one side is populated
    per relation (matching is done in `draft_builder.py`).
    """

    date: str | None = None
    description: str | None = None
    type: Literal["income", "expense", "transfer"] = "expense"
    amount: float | None = None
    currency: str | None = None
    account_id: uuid.UUID | None = None
    account_ref: str | None = None
    category_id: uuid.UUID | None = None
    category_ref: str | None = None
    merchant_id: uuid.UUID | None = None
    merchant_ref: str | None = None
    tags: list[str] = Field(default_factory=list)
    is_recurring: bool = False
    notes: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class ProposedEntity(BaseModel):
    name: str
    kind: str | None = None


class DraftBankAnalysis(BaseModel):
    bank_name: str | None = None
    currency: str | None = None
    movements: list[DraftMovement] = Field(default_factory=list)
    new_accounts: list[ProposedEntity] = Field(default_factory=list)
    new_categories: list[ProposedEntity] = Field(default_factory=list)
    new_merchants: list[ProposedEntity] = Field(default_factory=list)
    new_tags: list[ProposedEntity] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    overall_confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class BankImportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: BankImportStatus
    file_name: str
    draft: DraftBankAnalysis | None = None
    error_message: str | None
    duplicate_of: uuid.UUID | None = None
    created_transaction_count: int | None
    created_at: datetime


class BankImportPage(BaseModel):
    items: list[BankImportRead]
    total: int
    limit: int
    offset: int


class DraftPatch(BaseModel):
    """Replace the reviewed movement set before confirming (the user may drop or
    edit rows in the UI). Only `movements` is patchable — the proposed-entity
    lists are derived and recomputed from what the movements reference."""

    movements: list[DraftMovement]


class ConfirmBankRequest(BaseModel):
    """Records how many transactions the confirmed import produced. The rows
    themselves are created client-side in Dexie (offline-first), same as every
    manual entry — the backend only keeps the count for history."""

    transaction_count: int = Field(ge=0)
