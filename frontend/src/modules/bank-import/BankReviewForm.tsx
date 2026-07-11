/**
 * The review step for a parsed bank statement. Renders the AI's draft in the
 * app's own visual language (`card-panel` surfaces, mint/coral accents, the
 * `field-input` select) — the pipeline only ever produces a draft; this form is
 * the only thing that writes to the ledger, and only once the user confirms.
 *
 * The user picks a default `cuenta` for rows the statement didn't map to one,
 * can drop individual `movimientos`, and sees exactly which new `cuentas`,
 * `categorias`, `comercios` and `etiquetas` will be created. Each `transfer`
 * gets its own destination-account picker: pre-filled with the AI's match or
 * its proposed new account, but always editable — so a transfer the AI couldn't
 * pin to a second account is resolved here by hand instead of being dropped.
 * Confirming runs `confirmDraft` (all offline-first Dexie writes), which returns
 * the real number of rows written, then records it on the backend for history.
 */

import { useEffect, useMemo, useState } from "react";

import { useAccounts } from "../accounts/hooks";
import { formatMoney } from "../../shared/format";
import type { LocalAccount } from "../../db/db";
import type { BankImport, DraftBankAnalysis, DraftMovement } from "./api";
import { confirmDraft } from "./confirmImport";
import { useConfirmBankImport } from "./hooks";

// Sentinel select value meaning "create the AI's proposed new account" (as
// opposed to picking an existing one). Empty string means "not chosen yet".
const CREATE_REF = "__create_ref__";

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

function MovementRow({ movement, included }: { movement: DraftMovement; included: boolean }) {
  const isTransfer = movement.type === "transfer";
  const signed = movement.type === "income" ? movement.amount ?? 0 : -(movement.amount ?? 0);
  const label = isTransfer
    ? "transferencia"
    : movement.categoryRef ?? movement.merchantRef ?? movement.description ?? "";
  return (
    <div className={`flex items-center gap-3 ${included ? "" : "opacity-40"}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{movement.description ?? "—"}</p>
        <p className="truncate text-xs text-ink-soft">
          {movement.date ?? "sin fecha"}
          {label && ` · ${label}`}
          {movement.isRecurring && " · recibo"}
        </p>
      </div>
      <span
        className={`shrink-0 tabular-nums text-sm font-semibold ${isTransfer || signed < 0 ? "text-ink" : "text-mint"}`}
      >
        {formatMoney(isTransfer ? movement.amount ?? 0 : signed, movement.currency ?? "EUR")}
      </span>
    </div>
  );
}

function TransferDestination({
  movement,
  accounts,
  value,
  onChange,
}: {
  movement: DraftMovement;
  accounts: LocalAccount[];
  value: string;
  onChange: (value: string) => void;
}) {
  const unresolved = value === "";
  return (
    <div className="mt-2 flex items-center gap-2 pl-1">
      <span className="text-xs text-ink-soft">Cuenta destino</span>
      <select
        className={`field-input h-9 flex-1 py-1 text-sm ${unresolved ? "ring-1 ring-coral" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Cuenta destino de ${movement.description ?? "la transferencia"}`}
      >
        <option value="">Elige cuenta destino…</option>
        {movement.transferAccountRef && (
          <option value={CREATE_REF}>{`Crear "${movement.transferAccountRef}"`}</option>
        )}
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
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
  // Per-movement override of a transfer's destination account, keyed by the
  // movement's index in `draft.movements`. Absent = use the AI's own resolution.
  const [dest, setDest] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  // The destination select's current value for a transfer row: an explicit
  // override, else the AI's matched id, else its "create new account" proposal,
  // else unchosen ("").
  function destValue(m: DraftMovement, i: number): string {
    if (i in dest) return dest[i];
    if (m.transferAccountId) return m.transferAccountId;
    if (m.transferAccountRef) return CREATE_REF;
    return "";
  }

  // Apply the review's edits (exclusions + transfer-destination choices) to
  // produce the exact movement set `confirmDraft` should write.
  const prepared = useMemo<DraftMovement[]>(() => {
    return draft.movements
      .map((m, i) => ({ m, i }))
      .filter(({ i }) => !excluded.has(i))
      .map(({ m, i }) => {
        if (m.type !== "transfer") return m;
        const value = destValue(m, i);
        if (value === CREATE_REF) return { ...m, transferAccountId: null };
        return { ...m, transferAccountId: value || null, transferAccountRef: null };
      });
    // `dest` is read via `destValue`; list rebuilds when any of these change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.movements, excluded, dest]);

  const account = accounts.find((a) => a.id === accountId);
  const importable = prepared.filter(
    (m) => (m.amount ?? 0) > 0 && (m.type !== "transfer" || m.transferAccountId || m.transferAccountRef),
  ).length;

  function toggle(index: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function setDestFor(index: number, value: string) {
    setDest((prev) => ({ ...prev, [index]: value === CREATE_REF ? CREATE_REF : value }));
  }

  async function onConfirm() {
    if (!accountId || importable === 0) return;
    setSubmitting(true);
    try {
      const { transactionCount } = await confirmDraft(draft, prepared, accountId, account?.currency);
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
        {draft.movements.map((m, i) => {
          const included = !excluded.has(i);
          return (
            <li key={i} className="flex items-start gap-3 py-2">
              <input
                type="checkbox"
                checked={included}
                onChange={() => toggle(i)}
                aria-label={`Incluir ${m.description ?? "movimiento"}`}
                className="mt-1 accent-mint"
              />
              <div className="min-w-0 flex-1">
                <MovementRow movement={m} included={included} />
                {m.type === "transfer" && included && (
                  <TransferDestination
                    movement={m}
                    accounts={accounts}
                    value={destValue(m, i)}
                    onChange={(v) => setDestFor(i, v)}
                  />
                )}
              </div>
            </li>
          );
        })}
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
          disabled={!accountId || importable === 0 || submitting}
          className="btn-primary disabled:opacity-40"
          onClick={onConfirm}
        >
          {submitting ? "Guardando…" : `Importar ${importable} movimientos`}
        </button>
      </div>
    </div>
  );
}
