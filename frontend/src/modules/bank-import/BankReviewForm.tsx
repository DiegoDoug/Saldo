/**
 * The review step for a parsed bank statement. Renders the AI's draft in the
 * app's own visual language (`card-panel` surfaces, mint/coral accents, the
 * `field-input` select) — the pipeline only ever produces a draft; this form is
 * the only thing that writes to the ledger, and only once the user confirms.
 *
 * The user picks a default `cuenta` for rows the statement didn't map to one,
 * can drop individual `movimientos`, and sees exactly which new `cuentas`,
 * `categorias`, `comercios` and `etiquetas` will be created. Confirming runs
 * `confirmDraft` (all offline-first Dexie writes) then records the count on the
 * backend for history.
 */

import { useEffect, useMemo, useState } from "react";

import { useAccounts } from "../accounts/hooks";
import { formatMoney } from "../../shared/format";
import type { BankImport, DraftBankAnalysis, DraftMovement } from "./api";
import { confirmDraft } from "./confirmImport";
import { useConfirmBankImport } from "./hooks";

function ProposedChips({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-soft">{title}</span>
      <div className="flex flex-wrap gap-1">
        {names.map((n) => (
          <span key={n} className="rounded-full bg-mint-soft px-2 py-0.5 text-xs text-mint">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function MovementRow({
  movement,
  included,
  onToggle,
}: {
  movement: DraftMovement;
  included: boolean;
  onToggle: () => void;
}) {
  const signed = movement.type === "income" ? movement.amount ?? 0 : -(movement.amount ?? 0);
  const label = movement.categoryRef ?? movement.merchantRef ?? movement.description ?? "";
  return (
    <li className={`flex items-center gap-3 py-2 ${included ? "" : "opacity-40"}`}>
      <input
        type="checkbox"
        checked={included}
        onChange={onToggle}
        aria-label={`Incluir ${movement.description ?? "movimiento"}`}
        className="accent-mint"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{movement.description ?? "—"}</p>
        <p className="truncate text-xs text-ink-soft">
          {movement.date ?? "sin fecha"}
          {label && ` · ${label}`}
          {movement.isRecurring && " · recibo"}
        </p>
      </div>
      <span
        className={`shrink-0 tabular-nums text-sm font-semibold ${signed < 0 ? "text-ink" : "text-mint"}`}
      >
        {formatMoney(signed, movement.currency ?? "EUR")}
      </span>
    </li>
  );
}

export function BankReviewForm({
  bankImport,
  draft,
  onConfirmed,
  onDiscard,
}: {
  bankImport: BankImport;
  draft: DraftBankAnalysis;
  onConfirmed: (count: number) => void;
  onDiscard: () => void;
}) {
  const accounts = useAccounts();
  const confirm = useConfirmBankImport();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const included = useMemo(
    () => draft.movements.filter((_, i) => !excluded.has(i)),
    [draft.movements, excluded],
  );
  const account = accounts.find((a) => a.id === accountId);
  const nonTransfers = included.filter((m) => m.type !== "transfer").length;

  function toggle(index: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function onConfirm() {
    if (!accountId || nonTransfers === 0) return;
    setSubmitting(true);
    try {
      const { transactionCount } = await confirmDraft(
        draft,
        included,
        accountId,
        account?.currency,
      );
      confirm.mutate({ id: bankImport.id, transactionCount });
      onConfirmed(transactionCount);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      {draft.bankName && (
        <p className="text-sm text-ink-soft">
          Extracto de <span className="font-medium text-ink">{draft.bankName}</span> ·{" "}
          {draft.movements.length} movimientos detectados
        </p>
      )}

      {draft.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-coral-soft px-3 py-2 text-xs text-coral">
          {draft.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <ProposedChips title="Cuentas nuevas" names={draft.newAccounts.map((e) => e.name)} />
        <ProposedChips title="Categorías nuevas" names={draft.newCategories.map((e) => e.name)} />
        <ProposedChips title="Comercios nuevos" names={draft.newMerchants.map((e) => e.name)} />
        <ProposedChips title="Etiquetas nuevas" names={draft.newTags.map((e) => e.name)} />
      </div>

      <div>
        <span className="mb-1 block text-xs font-semibold text-ink-soft">
          Cuenta por defecto (para movimientos sin cuenta)
        </span>
        <select
          className="field-input"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label="Cuenta por defecto"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <ul className="divide-y divide-line">
        {draft.movements.map((m, i) => (
          <MovementRow key={i} movement={m} included={!excluded.has(i)} onToggle={() => toggle(i)} />
        ))}
      </ul>

      <div className="sticky bottom-0 flex justify-end gap-2 bg-card pt-2">
        <button
          type="button"
          className="rounded-xl border border-line px-4 py-2 text-sm"
          onClick={onDiscard}
        >
          Descartar
        </button>
        <button
          type="button"
          disabled={!accountId || nonTransfers === 0 || submitting}
          className="btn-primary disabled:opacity-40"
          onClick={onConfirm}
        >
          {submitting ? "Guardando…" : `Importar ${nonTransfers} movimientos`}
        </button>
      </div>
    </div>
  );
}
