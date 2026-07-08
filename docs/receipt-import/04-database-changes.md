# Receipt Import — Document 4: Database Changes

**Status:** Complete — builds on Document 3.

---

## One new table, zero changes to existing tables

`backend/app/modules/receipt_import/models.py`:

```python
class ReceiptStatus(str, Enum):
    uploaded = "uploaded"
    processing = "processing"
    ready = "ready"
    failed = "failed"
    confirmed = "confirmed"
    discarded = "discarded"

class ReceiptImport(SQLModel, table=True):
    __tablename__ = "receipt_import"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    status: ReceiptStatus = Field(default=ReceiptStatus.uploaded, index=True)
    content_hash: str = Field(index=True)          # sha256 of the uploaded bytes
    image_path: str                                  # relative path under SALDO_RECEIPT_STORAGE_DIR
    mime_type: str

    ocr_text: str | None = Field(default=None)
    ai_raw_response: str | None = Field(default=None)   # raw JSON string, kept for debugging/audit/reprocessing
    draft_json: str | None = Field(default=None)         # serialized DraftReceiptAnalysis

    error_message: str | None = Field(default=None)
    linked_transaction_id: uuid.UUID | None = Field(default=None)  # soft reference, no FK — same convention as Transaction.merchant_id

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
```

Notes on each deliberate choice:

- **No `deleted` / sync envelope columns.** Per Document 1 §4, this table is intentionally *not* part of the Dexie/sync protocol — it's server-only state, matching the already-planned `attachment` table in `docs/transformation/04-data-model-system-architecture.md:48`. "Delete" (the `DELETE /receipt-imports/{id}` endpoint) still uses a `discarded` status value rather than a hard row delete, for the same audit-friendliness every other module has, but it never appears in `/sync/pull` and needs no entry in `syncEngine.ts`'s registry.
- **`linked_transaction_id` is a plain UUID, no FK** — identical rationale to `Transaction.merchant_id`/`.recurring_id` (`transactions/models.py`): the referenced `Transaction` row is created client-side in Dexie and only reaches the server on the *next* sync push, which can race the `confirm` call. A real FK would require the transaction to already exist server-side at confirm time, which breaks offline-first. This is additive-migratable to a real FK later if that ordering ever changes.
- **`content_hash` is indexed** for the v1 duplicate-detection check (Document 3), not just future-proofing.
- **`ai_raw_response` is kept**, not discarded after parsing — it costs one TEXT column and pays for itself the first time a user reports a bad extraction and it needs debugging, or a future reprocessing feature wants to re-run `draft_builder` against an already-fetched AI response without a second paid API call.
- **Two JSON blobs (`ai_raw_response`, `draft_json`) stored as `str`, not SQLModel JSON columns** — matches the codebase's existing pattern for loosely-structured data (`WidgetLayout`'s single JSON blob per user, `Transaction.tags` as a JSON array) rather than normalizing into child tables for data that has no query need of its own yet. If line-item search or receipt-content search ever becomes a real feature (Document 2 §7), that's the point to split `draft_json` into real columns/tables — not before.

## Migration

Standard Alembic autogenerate, one new table, no alterations to any existing table:

```bash
alembic revision --autogenerate -m "add receipt_import table"
```

**Required, easy to forget (flagged per `CLAUDE.md`):** `backend/app/core/metadata.py` needs

```python
from app.modules.receipt_import import models as _receipt_import  # noqa: F401
```

added, or autogenerate silently produces an empty migration.

## Frontend: no Dexie schema change

Because the entity is server-only (Document 1 §4), **no new Dexie table, no `db.ts` version bump** is needed for `ReceiptImport` itself. The dialog's in-progress state (uploading/polling/reviewing) is transient React component state, not persisted state — if the user closes the tab mid-review, the receipt import row still exists server-side (`status="ready"`) and `GET /receipt-imports/{id}` can rehydrate it, but that rehydration is a nice-to-have for a later iteration, not a v1 requirement.

The only Dexie-relevant writes this feature triggers are through **existing** tables and **existing** write paths on confirm: `transactions.put(...)` (new transaction), optionally `merchants.put(...)` / `categories.put(...)` (new merchant/category) — all via the current `localRepo.ts` functions, unmodified.

## Storage on disk

New config, `core/config.py`, same shape as existing settings:

```python
receipt_storage_dir: str = "./data/receipts"
receipt_max_upload_mb: int = 10
```

`storage.py` writes to `{receipt_storage_dir}/{user_id}/{content_hash}.{ext}` — content-addressed (Document 1 §4's `attachment` precedent), naturally deduplicating identical uploads within a user even before the DB-level `content_hash` check runs, and namespaced by `user_id` so a filesystem-level leak can't cross accounts. This directory needs a volume mount in `docker-compose.yml` alongside the existing SQLite data volume — a one-line addition, not a new deployment concept, since the project already documents "all backend config is env-driven" and a Pi-friendly bind-mounted `./data` directory already exists for the DB.

## What was deliberately *not* added in v1

- `Merchant.aliases` column — flagged in Document 2 §7 as a good v1.1 follow-up (would help both this feature's learning loop and the future CSV importer's merchant matching), excluded now to keep this migration to exactly one new table.
- A `receipt_line_item` child table — no UI consumes it yet; `draft_json.line_items` holds the data in v1 if the AI happens to extract it, with no schema commitment until there's a reason to query it relationally.
