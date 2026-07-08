# Receipt Import — Document 7: Implementation Roadmap

**Status:** Complete — final document of the series. **Implementation does not start until this is approved**, per the brief's explicit instruction, and each stage below is executed one at a time with a pause for review after each, not batched.

---

## Open decision needing sign-off before Stage 1

**OCR provider default** (Document 5 §3): recommendation is Google Cloud Vision as the default (best receipt-photo accuracy, matching the brief's stated priority), with Tesseract shipped in the same PR as a selectable zero-cost/zero-external-dependency alternative (`SALDO_OCR_PROVIDER=tesseract`) for self-hosters who'd rather not add a second cloud dependency alongside DeepSeek. If you'd rather default to Tesseract-only for v1 and add Google Vision later, say so — it changes one config default and one line in Stage 2, not the architecture.

Everything else in Documents 1–6 is a direct, low-ambiguity consequence of the existing codebase's own conventions and is ready to build as specified.

## Stages

Each stage is one PR, ships a runnable app, and pauses for approval before the next begins — following this repo's own stated working discipline (`docs/transformation/06-implementation-master-plan.md`'s "one stage = one PR = a runnable, green app").

### Stage 1 — Backend skeleton, no AI yet
`receipt_import` module scaffolded: `models.py` + migration + `core/metadata.py` registration, `storage.py` (content-addressed disk storage, `SALDO_RECEIPT_STORAGE_DIR`), `schemas.py`, and a `router.py` with upload/get/list/delete/image endpoints wired to a **stub pipeline** that just marks status `ready` with a hand-built fixed `DraftReceiptAnalysis` (no real OCR/AI calls). Config additions (`SALDO_RECEIPT_MAX_UPLOAD_MB`, storage dir). Full pytest coverage of upload validation, ownership scoping, content-hash dedup, and the confirm/discard state transitions — all of this is independently correct and testable before any external API is involved.
**Why first:** de-risks the genuinely novel part of this feature (file upload, storage, a new table) independently of the AI integration, which is the part most likely to need iteration once tested against real receipts.

### Stage 2 — OCR + DeepSeek pipeline
`ocr/` and `ai/` provider abstractions, `GoogleVisionOcrProvider` + `TesseractOcrProvider` (per the decision above), `DeepSeekProvider`, `extraction_service.py`, `draft_builder.py`, real `pipeline.py` replacing the Stage 1 stub. `BackgroundTasks` wiring. Prompt templates in `ai/prompts.py`, iterated against a small fixture set of real (or realistic sample) receipt OCR text saved as test fixtures, so prompt changes have a regression test rather than being tuned by hand each time. Feature-flagged off by default (`deepseek_enabled`/`ocr` key checks) so this merges safely even before real API keys exist anywhere.
**Why second:** depends on Stage 1's storage/table; is the highest-uncertainty stage (prompt quality against real receipts), so it's isolated rather than bundled with matching logic.

### Stage 3 — Merchant & category matching
`merchant_matching.py` (exact/fuzzy/semantic tiers, `rapidfuzz` added to `requirements.txt`), `category_matching.py` (merchant-default/similarity/AI-semantic/suggest-new tiers), wired into `pipeline.py` and `draft_builder.py`'s output. Unit tests per tier with fixed fake merchant/category lists — this is pure Python logic (aside from the semantic tier, which is just reading fields already present in Stage 2's `RawExtraction`), fast and deterministic to test.
**Why third:** depends on Stage 2's `RawExtraction` shape; is the part of the brief (Phases 4–5) with the most explicit behavioral requirements ("never create duplicate merchants when confidence is high"), so it gets isolated review attention.

### Stage 4 — Frontend: capture, upload, polling
`ReceiptDropZone.tsx`, `apiUploadRequest` (multipart client addition), `useReceiptImport()` polling hook, the "Escanear recibo" entry point on `TransactionsPage.tsx`, and the dialog shell through the "uploading/processing" step only (review step is a placeholder). Manually verified end-to-end against a real backend with real API keys configured locally (per this session's "test the feature in a browser before reporting complete" standard) — capture → upload → see status flip to `ready` with raw JSON shown in a debug pane.
**Why fourth:** the first frontend stage, deliberately scoped to stop before the most complex UI (review form) so upload/polling plumbing is validated in isolation.

### Stage 5 — Frontend: review, confirm, inline create
`ReceiptReviewForm.tsx` (confidence badges, warnings banner), the merchant/category inline-create combobox generalized from `TagInput`, the confirm flow writing to Dexie via existing `localRepo` functions and calling `POST /receipt-imports/{id}/confirm`. Manually verified end-to-end including the offline/online boundary (confirm's Dexie write still works exactly like manual entry; only the scan step requires connectivity) and a full sync round-trip (scanned transaction appears correctly after `/sync/push` + a fresh pull on a second session).
**Why last:** the highest-stakes stage from a data-correctness standpoint (this is where a wrong AI suggestion could become a real transaction if the review UX isn't clear) — reviewed last, with everything underneath it already proven.

### Not in this roadmap (explicitly deferred, per Documents 2/6)
`Merchant.aliases`, a `/receipts` history page, multi-page capture, email/PDF ingestion, line-item extraction UI, subscription detection. Each has a designed hook (Document 2 §7) and is a clean additive follow-up once the core loop has real usage behind it — building them now would be exactly the "unnecessary abstractions" and "half-finished implementations" `CLAUDE.md`'s code-review standards warn against.

## Standing rules for every stage (inherited from `docs/transformation/06`, and this session's own instructions)

- Tests written and passing (`pytest`, `vitest`, `tsc --noEmit`), `ruff check .` clean, before a stage is presented as done.
- The security invariant — every `receipt_import` query filtered by `user.id` — is checked explicitly in each stage's own review, not assumed from Stage 1.
- No stage touches `syncEngine.ts`, the sync router, or the Dexie version number for `ReceiptImport` itself (Document 4) — if a later stage seems to need that, treat it as a signal the design has drifted and stop to reconsider rather than pushing through.
- At the end of each stage: architectural decisions taken, trade-offs, and risks are stated explicitly, and the next stage waits for approval — exactly as instructed.

---

**STOP.** This concludes the seven-document design series for the AI Receipt Import Agent. Awaiting approval of the OCR default (§ above) and the roadmap before Stage 1 begins.
