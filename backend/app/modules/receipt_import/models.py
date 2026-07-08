"""Receipt import table.

`ReceiptImport` tracks one uploaded receipt photo through the OCR/AI pipeline:
uploaded -> processing -> ready (a DraftReceiptAnalysis attached) -> confirmed
or discarded (or failed, if a pipeline step errors).

Unlike every other per-user table in this app, this one is deliberately **not**
part of the Dexie/sync protocol: no `deleted` tombstone, no last-write-wins
`updated_at` semantics on the client side. A receipt draft is transient,
server-only working state — the money it produces only becomes real once the
user confirms, at which point the resulting Transaction (created client-side in
Dexie, same as manual entry) syncs through the existing pipeline untouched. See
docs/receipt-import/01-architecture-review.md §4 and
docs/receipt-import/04-database-changes.md.

`linked_transaction_id` is a plain UUID with no FK constraint, the same
convention `Transaction.merchant_id`/`.recurring_id` already use: the
referenced Transaction is created client-side and may not have reached the
server yet when `confirm` is called.
"""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.budgeting.models import utcnow

RECEIPT_STATUSES = ("uploaded", "processing", "ready", "failed", "confirmed", "discarded")


class ReceiptImport(SQLModel, table=True):
    __tablename__ = "receipt_import"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    status: str = Field(default="uploaded", max_length=16, index=True)  # one of RECEIPT_STATUSES
    content_hash: str = Field(index=True, max_length=64)  # sha256 of the uploaded bytes
    image_path: str = Field(max_length=500)  # relative path under settings.receipt_storage_dir
    mime_type: str = Field(max_length=100)

    ocr_text: str | None = Field(default=None)
    # Raw provider JSON, kept for debugging and future reprocessing.
    ai_raw_response: str | None = Field(default=None)
    draft_json: str | None = Field(default=None)  # serialized DraftReceiptAnalysis

    error_message: str | None = Field(default=None, max_length=500)
    linked_transaction_id: uuid.UUID | None = Field(default=None)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
