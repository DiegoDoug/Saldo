# Receipt Import — Document 7: Implementation Roadmap

**Status:** Complete — final document of the series. **Implementation does not start until this is approved**, per the brief's explicit instruction, and each stage below is executed one at a time with a pause for review after each, not batched.

**OCR default decided:** Tesseract (Document 5 §3) — no external dependency beyond DeepSeek itself, in keeping with the self-hosted-by-default posture the rest of the design already commits to. `OcrProvider`'s interface stays swappable if a cloud provider is ever wanted later.

## Stages

Each stage is one PR, ships a runnable app, and pauses for approval before the next begins — following this repo's own stated working discipline (`docs/transformation/06-implementation-master-plan.md`'s "one stage = one PR = a runnable, green app").

### Stage 1 — Backend skeleton, no AI yet ✅ done
`receipt_import` module scaffolded: `models.py` + migration + `core/metadata.py` registration, `storage.py` (content-addressed disk storage, `SALDO_RECEIPT_STORAGE_DIR`), `schemas.py`, and a `router.py` with upload/get/list/draft-patch/confirm/discard/image endpoints wired to a **stub pipeline** that runs inline and marks status `ready` with a hand-built fixed `DraftReceiptAnalysis` (no real OCR/AI calls, no `BackgroundTasks` yet — both land in Stage 2 once there's real latency to hide). Config additions: `SALDO_RECEIPT_STORAGE_DIR`, `SALDO_RECEIPT_MAX_UPLOAD_MB`, `SALDO_DEEPSEEK_API_KEY`/`_MODEL`/`_BASE_URL` (unused by the stub, wired now so the 503-when-unconfigured gate is real from day one). 9 new pytest cases covering upload validation (content-type/size), ownership scoping, content-hash dedup, the draft-patch/confirm/discard state machine (including the 409s for editing/confirming a non-`ready` receipt), and the disabled-feature 503. Full existing suite (85 tests) + `ruff check .` stay green.
**Why first:** de-risks the genuinely novel part of this feature (file upload, storage, a new table) independently of the AI integration, which is the part most likely to need iteration once tested against real receipts.
**Found and fixed during implementation:** the image-download endpoint would have thrown an unhandled `FileNotFoundError` (→ 500) for a discarded receipt, since `discard_receipt` deletes the on-disk file but keeps the row; it now returns a clean 404 instead.
**Trade-off:** the DeepSeek config fields exist a stage early, purely to make the 503 gate testable now instead of retrofitting it in Stage 2.
**Risk carried forward:** none new — this stage touches no existing table or router logic, only adds one net-new table and one net-new router.

### Stage 2 — OCR + DeepSeek pipeline ✅ done
`ocr/` (`OcrProvider` protocol + `TesseractOcrProvider`, the decided default) and `ai/` (`ReceiptExtractionProvider` protocol + `RawExtraction`/`ExtractionContext` schemas + `DeepSeekProvider` + `ai/prompts.py`) provider abstractions; `extraction_service.build_context` (pulls the user's own categories/recent merchants into the prompt so semantic matching rides the one extraction call, per Document 5 §5); `draft_builder.py` mapping a `RawExtraction` into the `DraftReceiptAnalysis` contract (no real merchant/category *matching* yet — that's Stage 3, so today every match is exactly what the AI itself proposed); real `pipeline.py` replacing the Stage 1 stub, now scheduled via `BackgroundTasks` from `router.py` instead of awaited inline.
**Why second:** depends on Stage 1's storage/table; is the highest-uncertainty stage (prompt quality against real receipts), so it's isolated rather than bundled with matching logic.
**Found and fixed during implementation:** confirmed empirically (not from memory) that this project's pinned FastAPI version closes yield-dependencies — including the request's DB session — *before* running `BackgroundTasks`, not after. `pipeline.py` therefore opens its own session via `app.core.db.async_session_maker` rather than reusing the request's, and `conftest.py`'s `client` fixture now monkeypatches that same attribute to the ephemeral test database so background-task tests aren't silently working against the wrong (real, unmigrated) database. OCR/AI provider selection stays testable through ordinary `app.dependency_overrides` because `router.py` resolves both via `Depends` and hands the resolved instances into the background task, rather than the task re-resolving them itself.
**Trade-off:** dropped the `SALDO_AI_PROVIDER`/`SALDO_OCR_PROVIDER` config-driven dispatch this document originally sketched — with exactly one implementation of each Protocol, a `match` statement with one real branch was dead weight (`CLAUDE.md`'s "don't design for hypothetical future requirements"). The Protocols themselves already give a second provider a clean landing spot; a selector setting is one `if` away whenever that day comes.
**Also shipped:** Tesseract's system dependency wired everywhere it needed to be — `Dockerfile` (`tesseract-ocr` + `tesseract-ocr-spa`), CI (`.github/workflows/ci.yml`), and README's local-dev prerequisites — plus `.env.example` documenting every new `SALDO_DEEPSEEK_*`/`SALDO_RECEIPT_*`/`SALDO_OCR_*` variable. 12 new tests (5 pure `draft_builder` cases, a prompt-content check, 2 `DeepSeekProvider` tests with `httpx.AsyncClient.post` mocked exactly like `test_email.py`'s pattern, one real-Tesseract smoke test against a Pillow-rendered image, one `build_context` user-scoping test, plus the API-level pipeline success/category-and-merchant-match/failure tests) — full suite now 106 tests, `ruff check .` clean.
**Risk carried forward:** the DeepSeek prompt (`ai/prompts.py`) is untested against *real* receipt photos/OCR noise — only a hand-written few-shot example and a mocked response shape. Prompt quality against real-world receipts is the risk this stage's design doc flagged as highest-uncertainty, and it remains unresolved until it's tried against real DeepSeek calls (needs a real `SALDO_DEEPSEEK_API_KEY`, deliberately not exercised in CI).

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
