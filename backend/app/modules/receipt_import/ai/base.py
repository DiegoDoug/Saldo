"""AI provider interface for receipt extraction.

Business logic (`draft_builder.py`, `pipeline.py`) depends only on this
Protocol and the `RawExtraction`/`ExtractionContext` schemas below — never on
DeepSeek's request/response shape. Adding OpenAI/Gemini/Claude/a local model
later is a new file implementing `ReceiptExtractionProvider` plus one line in
`dependency.py`. See docs/receipt-import/05-ai-integration-design.md §1.

`RawExtraction`'s `confidence` dict keys match the JSON schema field names in
`ai/prompts.py` (e.g. "total", not "amount") — `draft_builder.py` reads both
by the same names.
"""

import uuid
from datetime import date
from typing import Protocol

from pydantic import BaseModel, Field


class CategoryHint(BaseModel):
    id: uuid.UUID
    name: str
    kind: str


class MerchantHint(BaseModel):
    id: uuid.UUID
    name: str


class ExtractionContext(BaseModel):
    """What the AI provider is given beyond the raw OCR text.

    Carrying the user's own categories/merchants here is what lets merchant
    and category *semantic* matching (docs/receipt-import/02 §5-6) ride along
    in the same extraction call instead of a second round-trip — see
    docs/receipt-import/05-ai-integration-design.md §5.
    """

    today: date
    default_currency: str
    categories: list[CategoryHint] = Field(default_factory=list)
    recent_merchants: list[MerchantHint] = Field(default_factory=list)


class RawExtraction(BaseModel):
    merchant_name: str | None = None
    date: str | None = None
    currency: str | None = None
    total: float | None = None
    tax: float | None = None
    payment_method: str | None = None
    address: str | None = None
    receipt_number: str | None = None
    possible_category_id: uuid.UUID | None = None
    possible_category_name: str | None = None
    possible_merchant_id: uuid.UUID | None = None
    notes: str | None = None
    confidence: dict[str, float] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class ReceiptExtractionProvider(Protocol):
    async def extract(self, ocr_text: str, context: ExtractionContext) -> RawExtraction: ...
