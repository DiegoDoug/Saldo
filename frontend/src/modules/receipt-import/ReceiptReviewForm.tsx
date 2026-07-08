/**
 * The real, editable review step (Stage 5) — replaces Stage 4's read-only
 * summary. Reuses the transaction form's field set and conventions
 * (`transactions/TransactionsPage.tsx`'s `AddTransactionForm`) rather than
 * inventing a parallel one: same hand-rolled `useState`-per-field style, same
 * account/category/merchant selects, same `parseAmount`/`formatMoney`.
 *
 * Confirming writes the Transaction to Dexie via the existing, unmodified
 * `transactions/localRepo.ts` — exactly like manual entry — then tells the
 * backend which transaction this receipt produced, purely for history
 * linking (`api.ts`'s `confirmReceipt`). The AI pipeline never gets a write
 * path to the ledger; this form is the only thing that calls `addTransaction`.
 *
 * New merchants/categories are created locally via the same Dexie
 * `localRepo` functions the Merchants/Categories screens already use
 * (`merchants/localRepo.ts`'s `addMerchant`, `budgeting/localRepo.ts`'s
 * `addCategory`) rather than a direct backend call — keeping the whole
 * confirm flow offline-first-consistent; the new row syncs up on the next
 * push exactly like the transaction itself. This is a deliberate departure
 * from Document 6 §2's original sketch (a direct `POST` there); see
 * docs/receipt-import/07-implementation-roadmap.md, Stage 5.
 */

import { type FormEvent, useEffect, useState } from "react";

import { useAccounts } from "../accounts/hooks";
import { useCategories } from "../budgeting/hooks";
import { addCategory } from "../budgeting/localRepo";
import { useMerchants } from "../merchants/hooks";
import { addMerchant } from "../merchants/localRepo";
import { addTransaction } from "../transactions/localRepo";
import { formatMoney, parseAmount } from "../../shared/format";
import type { DraftReceiptAnalysis, ReceiptImport } from "./api";
import { EntityCombobox } from "./EntityCombobox";
import { useConfirmReceipt } from "./hooks";

// Confidence badges are purely a UI-emphasis decision (Document 2 §7) — never
// a gate on confirming — so these live here as plain constants rather than
// backend config; a single easily-changed number isn't worth a settings round
// trip. Amount/date get a stricter bar since they're the two fields most
// consequential to get wrong in a ledger.
const DEFAULT_REVIEW_THRESHOLD = 0.7;
const CRITICAL_REVIEW_THRESHOLD = 0.9;

function needsReview(confidence: number | null, threshold = DEFAULT_REVIEW_THRESHOLD): boolean {
  return confidence == null || confidence < threshold;
}

function FieldLabel({ children, flagged }: { children: string; flagged: boolean }) {
  return (
    <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
      {children}
      {flagged && (
        <span className="rounded-full bg-coral-soft px-1.5 py-0.5 text-[10px] font-semibold text-coral">
          Revisar
        </span>
      )}
    </span>
  );
}

export function ReceiptReviewForm({
  receipt,
  draft,
  onConfirmed,
  onDiscard,
}: {
  receipt: ReceiptImport;
  draft: DraftReceiptAnalysis;
  onConfirmed: () => void;
  onDiscard: () => void;
}) {
  const accounts = useAccounts();
  const categories = useCategories().filter((c) => c.kind !== "income");
  const merchants = useMerchants();
  const confirm = useConfirmReceipt();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [merchantId, setMerchantId] = useState(draft.merchant.matchedMerchantId);
  const [categoryId, setCategoryId] = useState(draft.category.matchedCategoryId);
  const [amount, setAmount] = useState(
    typeof draft.amount.value === "number" ? String(draft.amount.value) : "",
  );
  const [date, setDate] = useState(
    typeof draft.date.value === "string" ? draft.date.value : new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(typeof draft.notes.value === "string" ? draft.notes.value : "");
  const [submitting, setSubmitting] = useState(false);

  // `accounts` resolves asynchronously from Dexie; adopt the first one once
  // it arrives, same pattern as `AddTransactionForm`.
  useEffect(() => {
    if (accounts.length > 0 && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const account = accounts.find((a) => a.id === accountId);
  const total = parseAmount(amount);
  const detectedCurrency = typeof draft.currency.value === "string" ? draft.currency.value : null;
  const currencyMismatch = !!(detectedCurrency && account && detectedCurrency !== account.currency);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accountId || total <= 0) return;
    setSubmitting(true);
    try {
      const transactionId = await addTransaction({
        type: "expense",
        amount: total,
        currency: account?.currency,
        accountId,
        categoryId: categoryId || null,
        merchantId: merchantId || null,
        date,
        notes,
      });
      // Best-effort: the transaction is already durably in Dexie (the part
      // that matters) — a failed/slow confirm call only affects this
      // receipt's own history link, not worth blocking the user over.
      confirm.mutate({ id: receipt.id, transactionId });
      onConfirmed();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {draft.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-coral-soft px-3 py-2 text-xs text-coral">
          {draft.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div>
        <FieldLabel flagged={needsReview(draft.merchant.confidence)}>Comercio</FieldLabel>
        <EntityCombobox
          label="Comercio"
          placeholder="Comercio…"
          options={merchants}
          valueId={merchantId}
          onSelect={setMerchantId}
          onCreate={(name) => addMerchant({ name, categoryId: categoryId || null })}
          initialQuery={draft.merchant.rawText ?? draft.merchant.suggestedName ?? ""}
        />
      </div>

      <div>
        <FieldLabel flagged={needsReview(draft.category.confidence)}>Categoría</FieldLabel>
        <EntityCombobox
          label="Categoría"
          placeholder="Categoría…"
          options={categories}
          valueId={categoryId}
          onSelect={setCategoryId}
          onCreate={(name) => addCategory(name, "variable")}
          initialQuery={draft.category.suggestedName ?? ""}
        />
      </div>

      <div>
        <FieldLabel flagged={needsReview(draft.amount.confidence, CRITICAL_REVIEW_THRESHOLD)}>
          Importe
        </FieldLabel>
        <input
          className="field-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          aria-label="Importe"
        />
        {currencyMismatch && (
          <p className="mt-1 text-xs text-ink-soft">
            Detectado en {detectedCurrency} · se guardará en {account?.currency} (moneda de la
            cuenta).
          </p>
        )}
      </div>

      <div>
        <FieldLabel flagged={needsReview(draft.date.confidence, CRITICAL_REVIEW_THRESHOLD)}>
          Fecha
        </FieldLabel>
        <input
          className="field-input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Fecha"
        />
      </div>

      <div>
        <FieldLabel flagged={false}>Cuenta</FieldLabel>
        <select
          className="field-input"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label="Cuenta"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <input
        className="field-input"
        placeholder="Notas (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-label="Notas"
      />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-xl border border-line px-4 py-2 text-sm"
          onClick={onDiscard}
        >
          Descartar
        </button>
        <button
          type="submit"
          disabled={!accountId || total <= 0 || submitting}
          className="btn-primary disabled:opacity-40"
        >
          {submitting ? "Guardando…" : `Confirmar ${total > 0 ? formatMoney(total, account?.currency ?? "EUR") : ""}`}
        </button>
      </div>
    </form>
  );
}
