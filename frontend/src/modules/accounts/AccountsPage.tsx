/**
 * Accounts screen: aggregated balances per account plus a quick "add account"
 * form. Reads live from Dexie (offline-first) and derives current balances from
 * the local transaction ledger.
 */

import { Landmark, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { formatMoney, parseAmount } from "../../shared/format";
import { type AccountType } from "../../db/db";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useAccountBalances, useTotalsByCurrency } from "./hooks";
import { addAccount, deleteAccount } from "./localRepo";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Cuenta corriente",
  savings: "Ahorro",
  cash: "Efectivo",
  credit_card: "Tarjeta de crédito",
  investment: "Inversión",
  crypto: "Cripto",
};

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];

export function AccountsPage() {
  const balances = useAccountBalances(true);
  const totals = useTotalsByCurrency(true);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Cuentas</h1>
        <button
          className="flex items-center gap-1 rounded-xl bg-mint px-3 py-2 text-sm font-semibold text-white"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus size={16} /> Nueva
        </button>
      </header>

      {Object.keys(totals).length > 0 && (
        <div className="card-panel flex flex-wrap gap-4 p-4">
          {Object.entries(totals).map(([currency, total]) => (
            <div key={currency}>
              <p className="text-xs uppercase tracking-wide text-ink-soft">Total {currency}</p>
              <p className="font-display text-xl font-semibold">{formatMoney(total, currency)}</p>
            </div>
          ))}
        </div>
      )}

      {adding && <AddAccountForm onDone={() => setAdding(false)} />}

      {balances.length === 0 && !adding ? (
        <EmptyState
          icon={<Landmark size={24} />}
          title="Sin cuentas todavía"
          message="Añade tu primera cuenta (corriente, ahorro, efectivo…) para empezar a registrar movimientos."
          action={
            <button
              className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setAdding(true)}
            >
              Añadir cuenta
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {balances.map(({ account, balance }) => (
            <li key={account.id} className="card-panel flex items-center justify-between p-4">
              <div>
                <p className="font-medium">
                  {account.name}
                  {account.archived === 1 && (
                    <span className="ml-2 text-xs text-ink-soft">(archivada)</span>
                  )}
                </p>
                <p className="text-xs text-ink-soft">{ACCOUNT_TYPE_LABELS[account.type]}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display font-semibold">
                  {formatMoney(balance, account.currency)}
                </span>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-soft hover:text-coral"
                  onClick={() => deleteAccount(account.id)}
                  aria-label={`Eliminar ${account.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddAccountForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [opening, setOpening] = useState("");
  const [currency, setCurrency] = useState("EUR");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addAccount({
      name: name.trim(),
      type,
      currency,
      openingBalance: parseAmount(opening),
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="card-panel flex flex-col gap-3 p-4">
      <input
        className="field-input"
        placeholder="Nombre de la cuenta"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nombre de la cuenta"
        autoFocus
      />
      <div className="flex gap-2">
        <select
          className="field-input"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          aria-label="Tipo de cuenta"
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          className="field-input w-24"
          placeholder="EUR"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
          aria-label="Moneda"
        />
      </div>
      <input
        className="field-input"
        placeholder="Saldo inicial (0)"
        value={opening}
        onChange={(e) => setOpening(e.target.value)}
        inputMode="decimal"
        aria-label="Saldo inicial"
      />
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded-xl border border-line px-4 py-2 text-sm" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white">
          Guardar
        </button>
      </div>
    </form>
  );
}
