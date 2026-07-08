# Receipt Import — Document 1: Architecture Review

**Status:** Complete — informs Documents 2–7.
**Scope:** How the existing codebase is shaped, what a `receipt_import` module can reuse untouched, and what is genuinely new. No code changes in this document.

---

## 1. Module shape (precedent to copy)

`backend/app/modules/<name>/` is a vertical slice: `models.py` (SQLModel tables), `schemas.py` (pydantic request/response), `router.py` (FastAPI endpoints), `service.py` (plain async functions, no classes, no repository layer — `ARCHITECTURE.md` rejects that ceremony deliberately). `frontend/src/modules/<name>/` mirrors it: `XPage.tsx`, `hooks.ts` (Dexie reads via `useLiveQuery`), `localRepo.ts` (Dexie writes — the *only* place mutations happen), `mappers.ts` (wire↔local conversion for sync). A new module is expected to look exactly like the existing twelve; nothing about receipt import justifies deviating from this except splitting `service.py` into several single-responsibility files (Phase 3 of the brief explicitly asks for this — justified in Document 2).

**Reusable as-is, no changes needed:**
- `identity` — `CurrentUser` dependency, JWT auth. Receipt endpoints just depend on it like every other router.
- `transactions` — full CRUD, `_validate_refs` (ownership checks for `account_id`/`category_id`/`merchant_id`), `TransactionCreate` schema. The receipt flow produces the *inputs* to this, never bypasses it.
- `merchants` — `Merchant` model already has `category_id` (default-category inheritance), `logo`, `color`, `recurring_probability` — fields the brief's "future-proofing" section asks for are already there, unused. `POST /merchants` is reused verbatim when the user confirms a new merchant.
- `budgeting` — `Category` (tree, `kind` ∈ income/fixed/variable, cycle-checked parenting). `POST /budgeting/categories` reused verbatim for new categories.
- `core/config.py` — `resend_api_key` + `email_enabled` is the exact template for an optional external-API key (`SALDO_DEEPSEEK_API_KEY`, `deepseek_enabled` property, log-and-503 fallback when unset).
- `shared/currency.py`'s `FxRateProvider` — a stateful `httpx`-based client behind a `get_fx_provider()` DI accessor, overridable in tests. This is the template for both the OCR and the DeepSeek provider abstractions.
- Frontend: `TanStack Query` is wired app-wide but **only used by `identity`'s mutations** — idle everywhere else, ready to own receipt-job polling without adding a dependency. `ForgotPasswordDialog.tsx`'s modal shell + internal `form → success` state machine is the direct template for a `scan → review → confirm` dialog.

## 2. What's missing, and why it matters here

- **No file upload anywhere.** Zero `UploadFile`, multipart, or `<input type="file">` in the entire codebase. Receipt import is the project's first upload surface — image storage, size/type limits, and the API client's multipart support are novel, not extensions of something existing.
- **No CSV import.** It's aspirational (`docs/transformation/05-technical-roadmap.md:53`), not built. The brief's "Scan Receipt next to Import CSV" framing describes a target IA, not current UI — treat CSV import as a sibling on paper only.
- **No FAB.** Primary "add" affordance is a header "+ Nuevo" toggle button (`TransactionsPage.tsx`, `MerchantsPage.tsx`) plus `AppNav`'s bottom-bar popover groups. No speed-dial component exists to extend.
- **No form-schema library.** No zod, no react-hook-form — forms are hand-rolled `useState`. A receipt-review form with per-field confidence badges will be the most complex form in the app; worth a light zod-adoption note (Document 6), not a blocking dependency.
- **`user_id` scoping is convention, not framework-enforced.** Every module hand-writes `.where(Model.user_id == user.id)`. A new module inherits this risk and must follow the same pattern explicitly — there's no ORM mixin to lean on.
- **CLAUDE.md is stale on one point:** its security-boundary note says "every query touching `Entry`, `Category`, or `WidgetLayout`." The actual ledger table is `Transaction` (`transactions/models.py`), not the budget-planning `Entry` (`budgeting/models.py`). Worth a doc fix outside this feature's scope, noted here so it isn't misapplied when reviewing this feature's code.

## 3. A load-bearing existing decision: offline-first writes

Per `CLAUDE.md`: "every UI write lands [in Dexie] first and must never block on the network." Transactions today are **never** created via a direct API call — `AddTransactionForm` writes straight to Dexie (`transactions/localRepo.ts`), and the sync engine pushes it later. Receipt import's AI/OCR steps *require* network by nature, but the **final Transaction write does not have to** — Document 2 designs the confirm step to hand the reviewed draft back to the same Dexie `localRepo` path, so the one invariant that matters most in this codebase (offline-first, no server-authoritative ledger writes) is preserved even though the feature that produced the draft is online-only.

## 4. An existing design precedent this feature should align with, not fight

`docs/transformation/04-data-model-system-architecture.md:48` already anticipated this exact need and made the call: an `attachment` table for "receipt images: content-addressed blobs on the server volume, metadata row in sync; explicitly *not* synced to Dexie by default (size)." That is precisely the storage model this feature needs, and Document 4 adopts it directly (content-addressed hashing gets duplicate-receipt detection for free — see Document 2 §Future-Proofing). It also means the receipt/draft data is **server-only state**, not part of the Dexie/sync protocol — no changes to `syncEngine.ts` or the sync router are needed at all. This is the single most important integration-point decision in this review: it keeps the entire AI pipeline out of the offline-sync surface area.

The same document series also anticipated the philosophical tension in this brief: `05-technical-roadmap.md:78` scopes future LLM assistance as "behind a user-supplied endpoint... **off by default**; no data leaves the host unless the user points it somewhere." Saldo's stated identity is self-hosted/forkable/privacy-first. Sending receipt photos to a third-party cloud API (DeepSeek) is a real deviation from that default posture. This review does not block on it — the task explicitly directs DeepSeek — but Document 5 designs the feature so it is **opt-in and unconfigured by default** (mirrors `resend_api_key`: empty key ⇒ feature disabled, not silently degraded), and the provider abstraction the brief already requires (for OpenAI/Gemini/local models) is exactly what lets a future self-hoster point this at Ollama with zero business-logic changes. That reconciles the brief's requirement with the project's own stated values instead of contradicting them.

## 5. Cleanest integration points (summary)

| Concern | Integration point |
|---|---|
| Auth | `identity.dependencies.CurrentUser`, used verbatim |
| Merchant creation/lookup | Existing `merchants` router/service, called from the frontend on confirm, or read-only `service.list_merchants` for matching |
| Category creation/lookup | Existing `budgeting` router/service, same pattern |
| Transaction creation | Existing `transactions/localRepo.ts` Dexie write, **not** a new backend write path |
| DB registration | `core/metadata.py`, one new import line |
| Config | `core/config.py`, new `SALDO_DEEPSEEK_*` / `SALDO_OCR_*` vars, same shape as `resend_api_key` |
| External API client pattern | `shared/currency.py`'s `FxRateProvider` DI pattern |
| Async job UX | `TanStack Query` `useQuery` + `refetchInterval`, unused elsewhere in the app |
| Modal UX | `ForgotPasswordDialog.tsx` shell + internal state machine |
| Image storage | New, but designed to match the already-planned `attachment` concept in `docs/transformation/04` |

Document 2 builds the technical design on exactly these seams.
