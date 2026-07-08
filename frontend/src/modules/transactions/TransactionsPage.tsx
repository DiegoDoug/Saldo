/**
 * Transactions screen: filterable/searchable list of the ledger plus a quick
 * add form (income / expense / transfer). Reads live from Dexie (offline-first).
 */

import { ArrowLeftRight, Camera, Plus, Receipt, Split, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { type LocalAccount, type LocalTransaction, type TransactionType } from "../../db/db";
import { formatMoney, parseAmount } from "../../shared/format";
import { useAccounts } from "../accounts/hooks";
import { useCategories } from "../budgeting/hooks";
import { useMerchants } from "../merchants/hooks";
import { useTagColors, useUsedTagNames } from "../tags/hooks";
import { ensureTags } from "../tags/localRepo";
import { tagColor } from "../tags/tagColor";
import { TagInput } from "../tags/TagInput";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ReceiptImportDialog } from "../receipt-import/ReceiptImportDialog";
import { useOnline } from "../receipt-import/useOnline";
import { useTransactions, type TransactionFilters } from "./hooks";
import {
  addSplit,
  addTransaction,
  addTransfer,
  deleteSplit,
  deleteTransaction,
  splitChildrenSumTo,
} from "./localRepo";

const SIGN: Record<TransactionType, number> = { income: 1, expense: -1, transfer: 0 };

export function TransactionsPage() {
  const accounts = useAccounts(true);
  const activeAccounts = useAccounts();
  const [filters, setFilters] = useState<TransactionFilters>({ sort: "date", order: "desc" });
  const transactions = useTransactions(filters);
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const online = useOnline();
  const tagColors = useTagColors();
  const usedTags = useUsedTagNames();

  const accountName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const toggleTagFilter = (name: string) =>
    setFilters((f) => ({ ...f, tag: f.tag === name ? undefined : name }));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">Movimientos</h1>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink disabled:opacity-40"
            onClick={() => setScanning(true)}
            disabled={accounts.length === 0 || !online}
            title={!online ? "Requiere conexión" : undefined}
          >
            <Camera size={16} /> Escanear recibo
          </button>
          <button
            className="flex items-center gap-1 rounded-xl bg-mint px-3 py-2 text-sm font-semibold text-white"
            onClick={() => setAdding((v) => !v)}
            disabled={accounts.length === 0}
          >
            <Plus size={16} /> Nuevo
          </button>
        </div>
      </header>

      {scanning && <ReceiptImportDialog onClose={() => setScanning(false)} />}

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

      {usedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por etiqueta">
          {usedTags.map((name) => {
            const active = filters.tag === name;
            const color = tagColor(name, tagColors);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTagFilter(name)}
                className="rounded-full px-2.5 py-1 text-xs font-semibold transition"
                style={
                  active
                    ? { background: color, color: "#fff" }
                    : { background: `${color}22`, color }
                }
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {adding && (
        <AddTransactionForm accounts={activeAccounts} onDone={() => setAdding(false)} />
      )}

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
          {/* Split children live under their parent — hide them from the flat
              ledger so a split shows once, as its parent row. */}
          {transactions
            .filter((t) => !t.parentId)
            .map((t) => (
              <TransactionRow key={t.id} tx={t} accountName={accountName} tagColors={tagColors} />
            ))}
        </ul>
      )}
    </div>
  );
}

function TransactionRow({
  tx,
  accountName,
  tagColors,
}: {
  tx: LocalTransaction;
  accountName: Map<string, string>;
  tagColors: Map<string, string>;
}) {
  const signed = tx.amount * SIGN[tx.type];
  const isTransfer = tx.type === "transfer";
  const isSplit = tx.splitParent === 1;
  return (
    <li className="card-panel flex items-center justify-between p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate font-medium">
          {tx.notes || (isTransfer ? "Transferencia" : accountName.get(tx.accountId) ?? "—")}
          {isSplit && (
            <span className="inline-flex items-center gap-1 rounded-full bg-mint-soft px-2 py-0.5 text-[10px] font-semibold text-mint">
              <Split size={10} /> Dividido
            </span>
          )}
        </p>
        <p className="flex items-center gap-1 text-xs text-ink-soft">
          {isTransfer && <ArrowLeftRight size={12} />}
          <span>{accountName.get(tx.accountId) ?? "—"}</span>
          {isTransfer && tx.transferAccountId && (
            <span>→ {accountName.get(tx.transferAccountId) ?? "—"}</span>
          )}
          <span>· {tx.date}</span>
        </p>
        {tx.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tx.tags.map((name) => {
              const color = tagColor(name, tagColors);
              return (
                <span
                  key={name}
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ background: `${color}22`, color }}
                >
                  {name}
                </span>
              );
            })}
          </div>
        )}
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
          onClick={() => (isSplit ? deleteSplit(tx.id) : deleteTransaction(tx.id))}
          aria-label="Eliminar movimiento"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}

interface SplitLine {
  categoryId: string;
  amount: string;
}

function AddTransactionForm({
  accounts,
  onDone,
}: {
  accounts: LocalAccount[];
  onDone: () => void;
}) {
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
  const [split, setSplit] = useState(false);
  const [lines, setLines] = useState<SplitLine[]>([{ categoryId: "", amount: "" }]);
  const [tags, setTags] = useState<string[]>([]);

  // `accounts` can still be empty on this form's first render (the Dexie live
  // query resolves asynchronously), so the `useState` initializers above may
  // have locked onto "". Adopt the first account once real data arrives.
  useEffect(() => {
    if (accounts.length > 0 && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const account = accounts.find((a) => a.id === accountId);
  const total = parseAmount(amount);
  const splittable = type !== "transfer";
  const splitChildren = lines.map((l) => ({
    categoryId: l.categoryId || null,
    amount: parseAmount(l.amount),
  }));
  const splitOk = split && splittable ? splitChildrenSumTo(total, splitChildren) : true;
  const linesSum = splitChildren.reduce((s, c) => s + c.amount, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || total <= 0) return;
    if (splittable && tags.length) await ensureTags(tags);
    if (split && splittable) {
      if (!splitOk) return;
      await addSplit(total, {
        type: type as "income" | "expense",
        currency: account?.currency,
        accountId,
        merchantId: merchantId || null,
        date,
        notes,
        tags,
        children: splitChildren,
      });
      onDone();
      return;
    }
    if (type === "transfer") {
      if (!toAccountId || toAccountId === accountId) return;
      await addTransfer({
        amount: total,
        currency: account?.currency,
        fromAccountId: accountId,
        toAccountId,
        date,
        notes,
      });
    } else {
      await addTransaction({
        type,
        amount: total,
        currency: account?.currency,
        accountId,
        categoryId: categoryId || null,
        merchantId: merchantId || null,
        date,
        notes,
        tags,
      });
    }
    onDone();
  }

  function pickType(t: TransactionType) {
    setType(t);
    if (t === "transfer") setSplit(false);
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
            onClick={() => pickType(t)}
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
      ) : split ? (
        <SplitLinesEditor
          lines={lines}
          setLines={setLines}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          total={total}
          linesSum={linesSum}
          currency={account?.currency ?? "EUR"}
        />
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

      {splittable && (
        <button
          type="button"
          onClick={() => setSplit((v) => !v)}
          aria-pressed={split}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold ${
            split ? "border-mint bg-mint-soft/60 text-mint" : "border-line text-ink-soft"
          }`}
        >
          <Split size={15} /> {split ? "Quitar división" : "Dividir en categorías"}
        </button>
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

      {type !== "transfer" && <TagInput value={tags} onChange={setTags} />}

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
        <button
          type="submit"
          disabled={!splitOk || total <= 0}
          className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}

function SplitLinesEditor({
  lines,
  setLines,
  categories,
  total,
  linesSum,
  currency,
}: {
  lines: SplitLine[];
  setLines: React.Dispatch<React.SetStateAction<SplitLine[]>>;
  categories: { id: string; name: string }[];
  total: number;
  linesSum: number;
  currency: string;
}) {
  const remaining = total - linesSum;
  const balanced = Math.round(remaining * 100) === 0 && total > 0;

  const update = (i: number, patch: Partial<SplitLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-3">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2">
          <select
            className="field-input flex-1"
            value={line.categoryId}
            onChange={(e) => update(i, { categoryId: e.target.value })}
            aria-label={`Categoría de la línea ${i + 1}`}
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="field-input w-28"
            placeholder="Importe"
            value={line.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
            inputMode="decimal"
            aria-label={`Importe de la línea ${i + 1}`}
          />
          <button
            type="button"
            aria-label={`Quitar línea ${i + 1}`}
            onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))}
            className="grid w-9 shrink-0 place-items-center rounded-xl border border-line text-ink-soft hover:text-coral"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setLines((ls) => [...ls, { categoryId: "", amount: "" }])}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-sm font-semibold text-mint hover:border-mint hover:bg-mint-soft/40"
      >
        <Plus size={15} /> Añadir línea
      </button>

      <div
        className={`flex justify-between text-xs font-semibold ${
          balanced ? "text-mint" : "text-coral"
        }`}
      >
        <span>Suma {formatMoney(linesSum, currency)}</span>
        <span>
          {balanced
            ? "Cuadra con el total"
            : `${remaining >= 0 ? "Faltan" : "Sobran"} ${formatMoney(Math.abs(remaining), currency)}`}
        </span>
      </div>
    </div>
  );
}
