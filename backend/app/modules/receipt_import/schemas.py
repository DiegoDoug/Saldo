"""Request/response schemas for the receipt-import API.

`DraftReceiptAnalysis` is the contract the AI pipeline (Stage 2+) must produce
and the one the frontend review screen renders — see
docs/receipt-import/02-technical-design.md §4. Every user-facing extracted
field is wrapped in `FieldValue` so a confidence score always travels with its
value; the frontend never needs a second lookup to know what to flag for
review (docs/receipt-import/06-frontend-ux-flow.md §2).

None of this is created by the AI pipeline directly into ledger tables — it is
only ever a draft the user reviews and edits before a Transaction is created
client-side. See `models.py` for why this table sits outside the sync
protocol.
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ReceiptStatus = Literal["uploaded", "processing", "ready", "failed", "confirmed", "discarded"]


class FieldValue(BaseModel):
    value: Any | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class MerchantMatch(BaseModel):
    raw_text: str | None = None
    matched_merchant_id: uuid.UUID | None = None
    suggested_name: str | None = None
    match_type: Literal["exact", "fuzzy", "semantic", "none"] = "none"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class CategoryMatch(BaseModel):
    matched_category_id: uuid.UUID | None = None
    suggested_name: str | None = None
    match_type: Literal["merchant_default", "existing_similarity", "ai_semantic", "suggest_new"] = (
        "suggest_new"
    )
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class DraftReceiptAnalysis(BaseModel):
    merchant: MerchantMatch
    category: CategoryMatch
    amount: FieldValue = FieldValue()
    currency: FieldValue = FieldValue()
    date: FieldValue = FieldValue()
    tax: FieldValue = FieldValue()
    payment_method: FieldValue = FieldValue()
    receipt_number: FieldValue = FieldValue()
    address: FieldValue = FieldValue()
    notes: FieldValue = FieldValue()
    line_items: list[dict] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    overall_confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ReceiptImportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ReceiptStatus
    draft: DraftReceiptAnalysis | None = None
    error_message: str | None
    duplicate_of: uuid.UUID | None = None
    linked_transaction_id: uuid.UUID | None
    created_at: datetime


class ReceiptImportPage(BaseModel):
    """A page of results plus the total match count — same shape as TransactionPage."""

    items: list[ReceiptImportRead]
    total: int
    limit: int
    offset: int


class DraftPatch(BaseModel):
    """Partial edit to a draft while status == "ready", applied before confirm."""

    merchant: MerchantMatch | None = None
    category: CategoryMatch | None = None
    amount: FieldValue | None = None
    currency: FieldValue | None = None
    date: FieldValue | None = None
    tax: FieldValue | None = None
    payment_method: FieldValue | None = None
    receipt_number: FieldValue | None = None
    address: FieldValue | None = None
    notes: FieldValue | None = None


class ConfirmReceiptRequest(BaseModel):
    transaction_id: uuid.UUID
