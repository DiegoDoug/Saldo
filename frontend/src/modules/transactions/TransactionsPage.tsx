/**
 * Transactions screen: filterable/searchable list of the ledger plus a quick
 * add form (income / expense / transfer). Reads live from Dexie (offline-first).
 */

import { ArrowLeftRight, Plus, Receipt, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { type LocalTransaction, type TransactionType } from "../../db/db";
import { formatMoney, parseAmount } from "../../shared/format";
import { useAccounts } from "../accounts/hooks";
import { useCategories } from "../budgeting/hooks";
import { useMerchants } from "../merchants/hooks";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useTransactions, type TransactionFilters } from "./hooks";
import { addTransaction, addTransfer, deleteTransaction } from "./localRepo";

const SIGN: Record<TransactionType, number> = { income: 1, expense: -1, transfer: 0 };

export function TransactionsPage() {
  const accounts = useAccounts(true);
  const [filters, setFilters] = useState<TransactionFilters>({ sort: "date", order: "desc" });
  const transactions = useTransactions(filters);
  const [adding, setAdding] = useState(false);

  const accountName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Movimientos</h1>
        <button
          className="flex items-center gap-1 rounded-xl bg-mint px-3 py-2 text-sm font-semibold text-white"
          onClick={() => setAdding((v) => !v)}
          disabled={accounts.length === 0}
        >
          <Plus size={16} /> Nuevo
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          className="field-input flex-1"
          placeholder="Buscar en notas…"
          value={filters.q ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))}
          aria-label="Buscar movimientos"
        />
        <select
          className="field-input w-40"
          value={filters.type ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, type: (e.target.value || undefined) as TransactionType }))
          }
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos</option>
          <option value="income">Ingresos</option>
          <option value="expense">Gastos</option>
          <option value="transfer">Transferencias</option>
        </select>
      </div>

      {adding && <AddTransactionForm onDone={() => setAdding(false)} />}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Receipt size={24} />}
          title="Primero crea una cuenta"
          message="Los movimientos pertenecen a una cuenta. Crea una cuenta para empezar a registrar ingresos y gastos."
        />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={<Receipt size={24} />}
          title="Sin movimientos"
          message="Registra tu primer ingreso, gasto o transferencia con el botón «Nuevo»."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {transactions.map((t) => (
            <TransactionRow key={t.id} tx={t} accountName={accountName} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TransactionRow({
  tx,
  accountName,
}: {
  tx: LocalTransaction;
  accountName: Map<string, string>;
}) {
  const signed = tx.amount * SIGN[tx.type];
  const isTransfer = tx.type === "transfer";
  return (
    <li className="card-panel flex items-center justify-between p-4">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {tx.notes || (isTransfer ? "Transferencia" : accountName.get(tx.accountId) ?? "—")}
        </p>
        <p className="flex items-center gap-1 text-xs text-ink-soft">
          {isTransfer && <ArrowLeftRight size={12} />}
          <span>{accountName.get(tx.accountId) ?? "—"}</span>
          {isTransfer && tx.transferAccountId && (
            <span>→ {accountName.get(tx.transferAccountId) ?? "—"}</span>
          )}
          <span>· {tx.date}</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`font-display font-semibold ${
            signed > 0 ? "text-mint" : signed < 0 ? "text-coral" : "text-ink-soft"
          }`}
        >
          {formatMoney(signed, tx.currency)}
        </span>
        <button
          className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-soft hover:text-coral"
          onClick={() => deleteTransaction(tx.id)}
          aria-label="Eliminar movimiento"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}

function AddTransactionForm({ onDone }: { onDone: () => void }) {
  const accounts = useAccounts();
  const categories = useCategories();
  const merchants = useMerchants();
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const account = accounts.find((a) => a.id === accountId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!accountId || value <= 0) return;
    if (type === "transfer") {
      if (!toAccountId || toAccountId === accountId) return;
      await addTransfer({
        amount: value,
        currency: account?.currency,
        fromAccountId: accountId,
        toAccountId,
        date,
        notes,
      });
    } else {
      await addTransaction({
        type,
        amount: value,
        currency: account?.currency,
        accountId,
        categoryId: categoryId || null,
        merchantId: merchantId || null,
        date,
        notes,
      });
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="card-panel flex flex-col gap-3 p-4">
      <div className="flex gap-2">
        {(["expense", "income", "transfer"] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
              type === t ? "border-mint bg-mint-soft/60 text-mint" : "border-line text-ink-soft"
            }`}
            onClick={() => setType(t)}
          >
            {t === "expense" ? "Gasto" : t === "income" ? "Ingreso" : "Transferencia"}
          </button>
        ))}
      </div>

      <input
        className="field-input"
        placeholder="Importe"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        aria-label="Importe"
        autoFocus
      />

      <select
        className="field-input"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        aria-label={type === "transfer" ? "Cuenta origen" : "Cuenta"}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      {type === "transfer" ? (
        <select
          className="field-input"
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          aria-label="Cuenta destino"
        >
          <option value="">Cuenta destino…</option>
          {accounts
            .filter((a) => a.id !== accountId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      ) : (
        <select
          className="field-input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Categoría"
        >
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {type !== "transfer" && merchants.length > 0 && (
        <select
          className="field-input"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          aria-label="Comercio"
        >
          <option value="">Sin comercio</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}

      <input
        className="field-input"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Fecha"
      />
      <input
        className="field-input"
        placeholder="Notas (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-label="Notas"
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
