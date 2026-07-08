# Receipt Import — Document 2: Technical Design

**Status:** Complete — builds on Document 1.
**Covers:** module layout, the extraction pipeline, merchant/category intelligence, the draft-transaction contract, and the confidence system.

---

## 1. Module layout

```
backend/app/modules/receipt_import/
  __init__.py
  models.py              # ReceiptImport SQLModel, ReceiptStatus enum
  schemas.py              # DraftReceiptAnalysis, ReceiptImportRead, ConfirmRequest, ...
  router.py               # HTTP endpoints (Document 3)
  storage.py              # content-addressed image storage
  pipeline.py             # orchestrator — the only place steps are chained
  extraction_service.py   # OCR text -> RawExtraction (calls AI provider)
  merchant_matching.py    # RawExtraction.merchant -> MerchantMatch
  category_matching.py    # RawExtraction + MerchantMatch -> CategoryMatch
  draft_builder.py        # assembles DraftReceiptAnalysis, applies confidence rules
  ocr/
    base.py               # OcrProvider protocol
    google_vision_provider.py
    dependency.py         # get_ocr_provider()
  ai/
    base.py               # ReceiptExtractionProvider protocol, RawExtraction schema
    deepseek_provider.py
    prompts.py             # Document 5 / Phase 8 prompt templates
    dependency.py          # get_ai_provider()
```

This is a deliberate, explicit deviation from the usual four-file module shape (`models/schemas/router/service`). The brief is explicit that "each step should be its own service; avoid one giant function," and a receipt import genuinely has seven distinguishable responsibilities (storage, OCR, AI call, merchant match, category match, draft assembly, orchestration). Splitting them keeps every file under ~100 lines and independently testable/mockable — a single `service.py` here would be the "giant service" the brief and `CLAUDE.md`'s code-review standards both warn against. The **router never imports OCR/AI code directly** — it only calls `pipeline.run_receipt_pipeline(...)` and `storage`. That keeps the public surface as small as any other module's router.

Frontend mirrors the existing shape, no deviation needed (the complexity lives server-side):

```
frontend/src/modules/receipt-import/
  ReceiptImportDialog.tsx   # scan -> processing -> review -> confirm state machine
  ReceiptDropZone.tsx        # file input / camera capture, first upload UI in the app
  ReceiptReviewForm.tsx      # prefilled draft, confidence badges, inline merchant/category create
  api.ts                     # multipart upload + polling calls (new: FormData support)
  hooks.ts                   # useReceiptImport() TanStack Query wrapper (upload + poll)
```

## 2. The pipeline

```
Image upload (multipart)
      │
      ▼
storage.save_image()  ──────────────► ReceiptImport row created, status=uploaded
      │
      ▼ (BackgroundTasks, in-process — see §3)
ocr_provider.extract_text(image_bytes)  ──► raw text/markdown
      │
      ▼
extraction_service.extract(ocr_text, user_context)  ──► RawExtraction (+ per-field confidence)
      │              (single DeepSeek call — see Document 5 for why category
      │               matching context rides along in this same call)
      ▼
merchant_matching.match(RawExtraction.merchant, user_id)  ──► MerchantMatch
      │
      ▼
category_matching.match(RawExtraction, MerchantMatch, user_id)  ──► CategoryMatch
      │
      ▼
draft_builder.build(...)  ──► DraftReceiptAnalysis, status=ready
      │
      ▼
Review screen (frontend, human in the loop)
      │
      ▼
Confirm: frontend creates Merchant/Category if new (existing endpoints),
         then writes Transaction to Dexie (existing localRepo), then
         POST /receipt-imports/{id}/confirm (metadata only)
      │
      ▼
Existing sync engine pushes Transaction/Merchant/Category normally
```

`pipeline.run_receipt_pipeline(session, user_id, receipt_id)` is the only function that calls all of the above in sequence; each step is independently unit-testable with a fake OCR/AI provider. Failure at any step sets `status=failed` + `error_message` and stops — no partial drafts.

## 3. Background execution, not a task queue

OCR + one LLM call typically complete in a few seconds. The project has already rejected Celery/Redis for background work on Pi-class hardware (`docs/transformation/04-data-model-system-architecture.md:89`: "a second/third process on a Pi to run five cron-like jobs"). Consistent with that, the pipeline runs via FastAPI's built-in `BackgroundTasks` inside the same process: `POST /receipt-imports` returns immediately with `status=processing`, and the frontend polls `GET /receipt-imports/{id}` via a `useQuery({ refetchInterval: 1500 })` — the idiomatic use of TanStack Query the architecture review flagged as available and unused. No new infrastructure, no new process, no new dependency.

## 4. Draft transaction contract (never write, only propose)

The AI pipeline never touches the `transaction`, `merchant`, or `category` tables. Its only output is `DraftReceiptAnalysis`, stored as JSON on the `ReceiptImport` row (Document 4) and returned to the frontend:

```jsonc
{
  "merchant": {
    "raw_text": "MCDONALD'S #4521",
    "matched_merchant_id": null,
    "suggested_name": "McDonald's",
    "match_type": "fuzzy",        // exact | fuzzy | semantic | none
    "confidence": 0.81
  },
  "category": {
    "matched_category_id": "c-uuid-...",
    "match_type": "merchant_default",  // merchant_default | existing_similarity | ai_semantic | suggest_new
    "suggested_name": null,
    "confidence": 0.9
  },
  "amount": { "value": 12.47, "confidence": 1.0 },
  "currency": { "value": "USD", "confidence": 0.95 },
  "date": { "value": "2026-07-06", "confidence": 0.95 },
  "tax": { "value": 1.02, "confidence": 0.7 },
  "payment_method": { "value": "VISA •••1234", "confidence": 0.6 },
  "receipt_number": { "value": "0004521-889", "confidence": 0.5 },
  "address": { "value": "123 Main St", "confidence": 0.4 },
  "notes": { "value": null, "confidence": null },
  "line_items": [],                 // reserved for Document 2 §7 future work, empty in v1
  "warnings": ["OCR text was low-contrast near the total line"],
  "missing_fields": ["payment_method"],
  "overall_confidence": 0.84
}
```

Every user-facing amount/date/text field is wrapped as `{ value, confidence }` — this is the confidence system (Phase 7) baked directly into the schema rather than bolted on. The frontend never needs a second lookup to know which fields to flag.

## 5. Merchant intelligence (Phase 4)

`merchant_matching.match()`, in priority order, scoped to the authenticated user's merchants only:

1. **Exact normalized match.** Normalize both sides (`normalize_merchant_name`: lowercase, strip diacritics/punctuation, collapse whitespace, drop trailing store-number/legal-suffix patterns like `#4521`, `S.A. DE C.V.`, `LLC`). Exact match ⇒ `matched_merchant_id` set, `match_type="exact"`, confidence ≥0.95.
2. **Fuzzy matching.** `rapidfuzz.fuzz.WRatio` against the user's existing merchant names. Score ≥85 ⇒ auto-selected (`match_type="fuzzy"`, confidence scaled from score). Score 65–85 ⇒ surfaced as a suggestion the user must actively accept (still `matched_merchant_id` populated, but the review screen shows it as "did you mean X?" rather than a fait accompli — see Document 6).
3. **Semantic AI matching.** If nothing clears the fuzzy floor, the same extraction call (Document 5) is given the user's most-recent/most-frequent N merchant names as context and asked to name a semantic match if one exists (e.g. "AMZN Mktp US" → "Amazon"). Lower confidence, always requires explicit confirmation.
4. **No match.** `matched_merchant_id=null`, `suggested_name` = the AI's cleaned-up extraction of the merchant name. The review screen offers "create merchant `<suggested_name>`" — never created automatically.

**Never create duplicate merchants when confidence is high** is enforced structurally: only tiers 1–2 populate `matched_merchant_id` for a match against an *existing* row; a new merchant is only ever created from an explicit user action on the review screen, never inside the pipeline.

## 6. Category intelligence (Phase 5)

`category_matching.match()`, in the brief's stated priority order:

1. **Merchant default category** — if a merchant was matched (tiers 1–3 above) and it has `category_id` set, use it directly (`match_type="merchant_default"`, high confidence).
2. **Existing category similarity** — normalized/fuzzy match between the AI's free-text `possible_category` guess and the user's existing category names (scoped to `kind` = fixed/variable, since receipts are never income).
3. **AI semantic selection** — rides along in the *same* DeepSeek call as the main extraction (Document 5 explains why this is one round-trip, not two): the prompt includes the user's category list, and the model may directly return an existing `category_id` instead of a free-text guess.
4. **Suggest new category** — only when none of the above clears the threshold. The draft carries `suggested_name` (and a `kind` guess); the review screen requires an explicit "create category" action. Categories are never auto-created, matching the brief's "never automatically generate unnecessary categories."

## 7. Future-proofing hooks designed in from day one

No later item in this list requires a rewrite of what's built now:

| Future item | Hook already present in v1 |
|---|---|
| Line-item extraction | `line_items: []` reserved key in `DraftReceiptAnalysis`; empty until a `receipt_line_item` table is added additively |
| VAT / tax tracking | `tax` field already extracted and stored, just not posted anywhere yet |
| Multi-page receipts | `OcrProvider.extract_text` takes `Sequence[bytes]` from v1, not a single image, even though the router only ever passes one today |
| Email / PDF receipt import | `OcrProvider` is format-agnostic by design; a `PdfOcrProvider` implements the same interface later; `POST /receipt-imports` gains a `source` field additively |
| Duplicate detection | `content_hash` column (Document 4) enables an "already imported" warning on upload in v1 itself — cheap enough to ship now, not deferred |
| Subscription detection | Reuses the already-existing, already-unused `Merchant.recurring_probability` field; real detection logic is out of scope (Phase 5.2 of `docs/transformation/05`) |
| Receipt history / search | `GET /receipt-imports` list endpoint ships in v1; search is additive query params later |
| Personal merchant learning | Flagged, not built: a future `Merchant.aliases: list[str]` column would let confirmed fuzzy/semantic matches "teach" the matcher — noted as a natural v1.1 follow-up, deliberately excluded now to avoid scope creep on the `Merchant` model |
| Automatic merchant logo/color | `Merchant.logo`/`.color` already exist and are unused; receipt import must never overwrite a user-set value on an *existing* merchant, only propose one when creating a *new* merchant (left null in v1 — no logo-lookup provider is in scope) |

Document 3 (Backend API), Document 4 (Database), and Document 5 (AI Integration) make each of these pieces concrete.
