"""Bank-import table.

`BankImport` tracks one uploaded bank statement file (CSV or Markdown) through
the AI parsing pipeline: uploaded -> processing -> ready (a `DraftBankAnalysis`
attached) -> confirmed or discarded (or failed, if a pipeline step errors).

Like `ReceiptImport` (and unlike every syncable table), this one is deliberately
**not** part of the Dexie/sync protocol: it has no `deleted` tombstone and no
last-write-wins `updated_at` client semantics. A bank draft is transient,
server-only working state — the `movimientos`, `cuentas`, `categorias`,
`comercios`, `etiquetas` and `recibos` it proposes only become real once the
user confirms them, at which point the resulting rows are created client-side in
Dexie (same as manual entry) and sync through the existing pipeline untouched.

`created_transaction_count` records how many transactions a confirmed import
produced, purely for history — the rows themselves are client-generated and may
not have reached the server yet when `confirm` is called (same reasoning as
`ReceiptImport.linked_transaction_id`).
"""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.modules.budgeting.models import utcnow

BANK_IMPORT_STATUSES = ("uploaded", "processing", "ready", "failed", "confirmed", "discarded")


class BankImport(SQLModel, table=True):
    __tablename__ = "bank_import"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    status: str = Field(default="uploaded", max_length=16, index=True)  # BANK_IMPORT_STATUSES
    content_hash: str = Field(index=True, max_length=64)  # sha256 of the uploaded bytes
    file_name: str = Field(max_length=255)
    file_path: str = Field(max_length=500)  # relative path under settings.bank_storage_dir
    mime_type: str = Field(max_length=100)

    # Raw provider JSON, kept for debugging and future reprocessing.
    ai_raw_response: str | None = Field(default=None)
    draft_json: str | None = Field(default=None)  # serialized DraftBankAnalysis

    error_message: str | None = Field(default=None, max_length=500)
    created_transaction_count: int | None = Field(default=None)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
