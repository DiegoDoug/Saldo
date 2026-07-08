# Receipt Import — Document 3: Backend API Design

**Status:** Complete — builds on Document 2.
**Convention check:** follows the existing per-module patterns exactly — `APIRouter(prefix="/receipt-imports", tags=["receipt-imports"])` self-declares its prefix (mounted in `main.py`'s factory like every other router); `Create`/`Read` schema pairs; `HTTPException` with string `detail`; every query filtered by `user.id`; soft-delete over hard delete.

---

## Endpoints

### `POST /receipt-imports`
Multipart upload (`UploadFile`), the first multipart endpoint in the backend.
- Validates content-type (`image/jpeg`, `image/png`, `image/webp`, `image/heic`) and size (`SALDO_RECEIPT_MAX_UPLOAD_MB`, default 10).
- Returns `503` immediately if `settings.deepseek_enabled` is `False` (no key configured) — mirrors `email_enabled`'s "disabled, not broken" pattern.
- Computes `content_hash` (sha256) before writing; if a non-discarded `ReceiptImport` with the same hash already exists for this user, returns it with `duplicate_of` set instead of creating a new one and reprocessing (Document 2 §7 duplicate detection, cheap to ship in v1).
- Otherwise: `storage.save_image()`, creates `ReceiptImport(status="uploaded")`, schedules `pipeline.run_receipt_pipeline` via `BackgroundTasks`, returns `202 Accepted` with `ReceiptImportRead` (`status="processing"`).

### `GET /receipt-imports/{id}`
Returns `ReceiptImportRead`: `status`, and once `status in ("ready", "confirmed")`, the full `DraftReceiptAnalysis`. `404` if not found or not owned (never `403`, same "don't leak existence" convention as every other module). This is the endpoint the frontend polls.

### `GET /receipt-imports`
List, newest first, filtered by `user.id`, `deleted=False`. Supports the same `limit`/`offset` pagination shape as `transactions` (the only other list endpoint that paginates) since receipt history can grow — `ReceiptImportPage { items, total, limit, offset }`.

### `PATCH /receipt-imports/{id}/draft`
Optional, small: persists user edits to `draft_json` before confirming (so a page refresh mid-review doesn't lose edits). Body is a partial `DraftReceiptAnalysis`; merges with `model_dump(exclude_unset=True)`, same PATCH semantics every other module uses. Only valid while `status="ready"`.

### `POST /receipt-imports/{id}/confirm`
Body: `{ transaction_id: UUID }` — the UUID the frontend already generated for the Dexie-side `Transaction` write (client-generated ids are the existing convention; see `transactions/models.py`). This endpoint does **not** create the transaction — it records `linked_transaction_id` on the `ReceiptImport` row and sets `status="confirmed"`. Validates only that the receipt belongs to the user and is in `status="ready"`; `409` otherwise (already confirmed/discarded). This keeps the AI module honestly unable to write to the ledger, per the brief's hard requirement, while still giving receipt history a link to what it produced (Document 2 §7).

### `DELETE /receipt-imports/{id}`
Soft-delete (`deleted=True`, matches every other module), and eagerly deletes the on-disk image via `storage.delete_image()` (images are the one thing worth reclaiming immediately — they're the only large blobs in the whole app; the DB row is kept for audit/history like everything else soft-deleted).

### `GET /receipt-imports/{id}/image`
Streams the stored image (`FileResponse`/streaming body) for the review screen's preview pane. Scoped by `user.id` like everything else — this is the one endpoint serving a file rather than JSON, new but structurally trivial.

## Schemas (`schemas.py`)

```python
class ReceiptStatus(str, Enum):
    uploaded = "uploaded"
    processing = "processing"
    ready = "ready"
    failed = "failed"
    confirmed = "confirmed"
    discarded = "discarded"

class FieldValue(BaseModel):
    value: Any | None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

class MerchantMatch(BaseModel):
    raw_text: str | None
    matched_merchant_id: uuid.UUID | None
    suggested_name: str | None
    match_type: Literal["exact", "fuzzy", "semantic", "none"]
    confidence: float = Field(ge=0.0, le=1.0)

class CategoryMatch(BaseModel):
    matched_category_id: uuid.UUID | None
    suggested_name: str | None
    match_type: Literal["merchant_default", "existing_similarity", "ai_semantic", "suggest_new"]
    confidence: float = Field(ge=0.0, le=1.0)

class DraftReceiptAnalysis(BaseModel):
    merchant: MerchantMatch
    category: CategoryMatch
    amount: FieldValue
    currency: FieldValue
    date: FieldValue
    tax: FieldValue
    payment_method: FieldValue
    receipt_number: FieldValue
    address: FieldValue
    notes: FieldValue
    line_items: list[dict] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    overall_confidence: float = Field(ge=0.0, le=1.0)

class ReceiptImportRead(BaseModel):
    id: uuid.UUID
    status: ReceiptStatus
    draft: DraftReceiptAnalysis | None
    error_message: str | None
    duplicate_of: uuid.UUID | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ConfirmReceiptRequest(BaseModel):
    transaction_id: uuid.UUID
```

No `field_validator`s beyond the `ge=0.0, le=1.0` bounds pattern already used on `Merchant.recurring_probability` — consistent with the codebase's near-total avoidance of pydantic validators in favor of service-layer checks.

## Dependency wiring (`main.py`)

```python
def create_app() -> FastAPI:
    ...
    from app.modules.receipt_import.router import router as receipt_import_router
    app.include_router(receipt_import_router)
```

Same local-import-inside-factory pattern as every other module, for the same stated reason (avoid import-time circularity).

## Reused, not reimplemented

- `POST /merchants` and `POST /budgeting/categories` are called **by the frontend**, not the backend, when the user accepts a "create new" suggestion during review — no new merchant/category creation logic exists in `receipt_import` at all.
- Ownership validation on confirm reuses the same shape as `transactions/router.py`'s `_validate_refs`, but there is nothing to validate refs *against* here since `receipt_import` never touches `account_id`/`category_id`/`merchant_id` directly — those are validated where they're actually used, in the client's subsequent Dexie write and the next `/sync/push`.
