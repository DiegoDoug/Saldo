# Receipt Import — Document 6: Frontend UX Flow

**Status:** Complete — builds on Documents 1–5.

---

## 1. Entry point

No FAB and no CSV import exist to place this "next to" (Document 1 §2) — the brief's framing describes a target IA, not today's UI. The concrete, low-risk placement: a second header button next to the existing "+ Nuevo" toggle on `TransactionsPage.tsx` (`frontend/src/modules/transactions/TransactionsPage.tsx:52-58`), labeled "Escanear recibo." Same visual weight, same location users already look to add a transaction, zero new navigation infrastructure. Disabled (with a tooltip, "Requiere conexión") when `navigator.onLine` is false or when the backend reports the feature unconfigured (Document 5 §2) — the one place in the app that needs an explicit online-only affordance, everything else being offline-tolerant by design.

A second discoverability entry in `AppNav`'s "Dinero" popover group is a reasonable v1.1 addition, not required for launch — the transactions page is where every version of this flow ends up regardless of where it started.

## 2. The dialog: a state machine, not a route

Reuses `ForgotPasswordDialog.tsx`'s exact shell (`fixed inset-0 z-50 grid place-items-center bg-ink/40`, click-outside/Escape to close, `role="dialog" aria-modal="true"`) and its internal state-machine pattern (`step === "form" ? <X/> : <Y/>`), extended to four steps instead of two:

```
capture → uploading → reviewing → done
   │           │            │
   └─ pick/take photo   └─ AI failed → error state, retry or discard
```

No new route (`/receipts/...`) — matches the existing precedent that `ForgotPasswordDialog` is a dialog, not a page, and avoids adding routing infra for a flow that's fundamentally a modal overlay on the transactions list the user is already looking at.

### Step 1 — capture
`ReceiptDropZone.tsx`: `<input type="file" accept="image/*" capture="environment">` for mobile camera capture, plus drag-and-drop for desktop. This is the first file-input in the app (Document 1 §2) — kept intentionally minimal: one file, client-side size/type pre-check (mirroring the backend's limits so the user gets instant feedback instead of a round-trip 413) before upload.

### Step 2 — uploading / processing
`api.ts` gains the first `FormData`-based call in the codebase (the existing `apiRequest` helper only does JSON/urlencoded bodies — a small, additive `apiUploadRequest` variant, not a rewrite). On success (`202`), `hooks.ts`'s `useReceiptImport()` switches to `useQuery({ queryKey: ["receiptImport", id], refetchInterval: (data) => data?.status === "processing" ? 1500 : false })` — the first polling `useQuery` in the app, but an idiomatic one given TanStack Query is already wired and otherwise idle (Document 1 §1). UI shows a spinner over the captured image thumbnail with a short rotating status line ("Leyendo el recibo…" → "Buscando comercio…" is out of scope for v1 — a single "Analizando…" message is enough; the backend doesn't expose sub-step granularity and shouldn't need to).

### Step 3 — review
`ReceiptReviewForm.tsx` reuses `AddTransactionForm`'s field set and layout (amount, currency, date, account select, category select, merchant select, notes, tags) rather than inventing a parallel form — prefilled from `DraftReceiptAnalysis`. Three additions beyond the existing form:

- **Confidence badges.** Any field with `confidence < SALDO_RECEIPT_CONFIDENCE_THRESHOLD` (a small, amber "revisar" badge next to the field label) — purely visual emphasis, never a blocker; the user is always free to confirm regardless (Phase 6/7's "human is always the final gate"). `amount` and `date` use a stricter threshold (0.9) than other fields since they're the two most consequential to get wrong in a personal-finance ledger.
- **Inline merchant/category creation.** Today, the transaction form's merchant/category are plain `<select>`s with no "create new" affordance (Document 1 §3) — a receipt scan of an unrecognized merchant needs one. Generalizes `TagInput`'s create-on-type combobox pattern (already in the codebase for tags) to merchant and category selects: typing a name that doesn't match shows a "Crear `<name>`" option, which on selection calls the existing `POST /merchants` or `POST /budgeting/categories` endpoint immediately (not deferred to confirm) so the newly-created id is available like any other option for the rest of the review.
- **`account_id` is always required and never AI-suggested** — a receipt has no signal for which of the user's accounts paid, so this is the one field the form always makes the user pick explicitly, exactly as `AddTransactionForm` already requires today.
- A dismissible warnings banner surfaces `DraftReceiptAnalysis.warnings` verbatim (e.g. "El texto del recibo estaba borroso") above the form.

Account for the account/merchant/category "created via API but not yet in local Dexie" gap: after a successful `POST /merchants` or `POST /budgeting/categories`, the frontend also writes the row into the local Dexie table directly (`merchants/localRepo.ts` / `budgeting`'s category repo already expose the primitives for this) so it's usable immediately without waiting on the next `/sync/pull` — symmetric with how the eventual transaction write works.

### Step 4 — confirm
On "Confirmar": `addTransaction(...)` (existing `transactions/localRepo.ts`, unmodified) writes to Dexie exactly as manual entry does, using the client-generated transaction id; then `POST /receipt-imports/{id}/confirm` sends that id to the backend (Document 3) purely for receipt-history linking. Dialog shows a brief success state (mirrors `ForgotPasswordDialog`'s `ConfirmationView`) and closes; the sync engine picks up the new rows on its next push exactly like a manually entered transaction — no special-casing anywhere in the sync path.

"Descartar" is available at every step (`capture`/`reviewing`/error) and calls `DELETE /receipt-imports/{id}` if a receipt row already exists.

## 3. Error handling

- Upload rejected (bad type/too large): inline error on the drop-zone, no dialog step change.
- Feature disabled (`503`): originally planned as hiding the button entirely via a boot-time capabilities check (see below). **As built (Stage 4):** no such endpoint existed to piggyback on, and adding one just for this one flag would be premature — the button always renders (gated only on having an account and being online) and the dialog surfaces the backend's 503 inline ("El escaneo de recibos no está configurado en este servidor.") on the first upload attempt, then returns to the capture step. Functionally equivalent for a self-hoster who hasn't set a key: one clear message instead of a hidden button. Revisit the original plan below if a real settings/capabilities endpoint appears for other reasons: checked once via a small capabilities flag alongside the app-boot config fetch, not a new endpoint — Document 5 §2's `deepseek_enabled` could ride on the same settings surface the frontend reads at boot, e.g. `GET /health` or a comparable existing check.
- Pipeline failure (`status="failed"`): review step shows `error_message` and two actions — "Reintentar" (re-upload the same image, since content-hash dedup means this doesn't create clutter) or "Descartar."
- Duplicate detected on upload (`duplicate_of` set): a small confirmation ("Ya importaste este recibo el [date] — ¿continuar de todos modos?") before proceeding, rather than silently reprocessing or silently blocking.

## 4. What's deliberately out of scope for v1's UX

- No dedicated `/receipts` history page — `GET /receipt-imports` (Document 3) exists for the API to be ready, but a browsing UI is a natural, separable v1.1 addition once the core scan→confirm loop is validated with real users.
- No multi-page capture UI, even though the OCR interface already supports it (Document 2 §7) — v1 is one photo, one receipt.
- No zod/react-hook-form migration for this form specifically — it follows the existing hand-rolled `useState` convention to stay consistent with `AddTransactionForm`, even though Document 1 flagged this as a place the convention will eventually strain. Worth a standalone follow-up rather than mixing a forms-library migration into this feature's first PR.
