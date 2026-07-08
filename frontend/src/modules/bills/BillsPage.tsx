/**
 * Bills / subscriptions screen: upcoming recurring charges (projected on-device)
 * with a "Registrar" action that materializes the due occurrence into a real
 * transaction, plus rule management. Offline-first (Dexie-first writes).
 */

import { CalendarClock, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { type Frequency, type LocalAccount, type TransactionType } from "../../db/db";
import { formatMoney, parseAmount } from "../../shared/format";
import { useAccounts } from "../accounts/hooks";
import { useCategories } from "../budgeting/hooks";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useRecurringRules, useUpcomingBills } from "./hooks";
import { addRule, deleteRule, materializeRule } from "./localRepo";

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Diario",
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
};

export function BillsPage() {
  const rules = useRecurringRules();
  const upcoming = useUpcomingBills(60);
  const accounts = useAccounts(true);
  const activeAccounts = useAccounts();
  const [adding, setAdding] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function registerDue(ruleId: string) {
    const rule = rules.find((r) => r.id === ruleId);
    if (rule) await materializeRule(rule, today);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Recibos</h1>
        <button
          className="flex items-center gap-1 rounded-xl bg-mint px-3 py-2 text-sm font-semibold text-white"
          onClick={() => setAdding((v) => !v)}
          disabled={accounts.length === 0}
        >
          <Plus size={16} /> Nuevo
        </button>
      </header>

      {adding && <AddRuleForm accounts={activeAccounts} onDone={() => setAdding(false)} />}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={24} />}
          title="Primero crea una cuenta"
          message="Los recibos recurrentes se cargan sobre una cuenta. Crea una cuenta para programar tus suscripciones."
        />
      ) : rules.length === 0 && !adding ? (
        <EmptyState
          icon={<CalendarClock size={24} />}
          title="Sin recibos programados"
          message="Programa suscripciones y gastos recurrentes (Netflix, alquiler…) para anticipar tus próximos pagos."
          action={
            <button
              className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setAdding(true)}
            >
              Añadir recibo
            </button>
          }
        />
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink-soft">Próximos 60 días</h2>
            {upcoming.length === 0 ? (
              <p className="card-panel p-4 text-sm text-ink-soft">Nada previsto en este periodo.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {upcoming.map((bill) => (
                  <li
                    key={bill.occurrenceId}
                    className="card-panel flex items-center justify-between p-4"
                  >
                    <div>
                      <p className="font-medium">{bill.name}</p>
                      <p className="text-xs text-ink-soft">{bill.date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-display font-semibold text-coral">
                        {formatMoney(bill.amount, bill.currency)}
                      </span>
                      {bill.date <= today && (
                        <button
                          className="flex items-center gap-1 rounded-lg bg-mint-soft/60 px-2.5 py-1.5 text-xs font-semibold text-mint"
                          onClick={() => registerDue(bill.ruleId)}
                        >
                          <Check size={14} /> Registrar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink-soft">Recibos programados</h2>
            <ul className="flex flex-col gap-2">
              {rules.map((rule) => (
                <li key={rule.id} className="card-panel flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-xs text-ink-soft">
                      {FREQUENCY_LABELS[rule.frequency]} · próximo {rule.nextRun}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display font-semibold">
                      {formatMoney(rule.amount, rule.currency)}
                    </span>
                    <button
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-soft hover:text-coral"
                      onClick={() => deleteRule(rule.id)}
                      aria-label={`Eliminar ${rule.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function AddRuleForm({ accounts, onDone }: { accounts: LocalAccount[]; onDone: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const type: TransactionType = "expense";

  // `accounts` can still be empty on this form's first render (the Dexie live
  // query resolves asynchronously), so the `useState` initializer above may
  // have locked onto "". Adopt the first account once real data arrives.
  useEffect(() => {
    if (accounts.length > 0 && !accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (!name.trim() || !accountId || value <= 0) return;
    await addRule({
      name: name.trim(),
      type,
      amount: value,
      currency: accounts.find((a) => a.id === accountId)?.currency,
      accountId,
      categoryId: categoryId || null,
      frequency,
      startDate,
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="card-panel flex flex-col gap-3 p-4">
      <input
        className="field-input"
        placeholder="Nombre (p. ej. Netflix)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nombre del recibo"
        autoFocus
      />
      <input
        className="field-input"
        placeholder="Importe"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        aria-label="Importe"
      />
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
      <div className="flex gap-2">
        <select
          className="field-input"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          aria-label="Frecuencia"
        >
          {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="field-input"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="Fecha de inicio"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-xl border border-line px-4 py-2 text-sm"
          onClick={onDone}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white"
        >
          Guardar
        </button>
      </div>
    </form>
  );
}
