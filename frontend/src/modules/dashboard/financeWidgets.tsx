/**
 * Finance dashboard widgets. Unlike the budgeting widgets (which receive the
 * year's computed figures as props), these are self-contained: each pulls its
 * own data from Dexie via hooks and renders gracefully when there's nothing yet.
 * They are registered in the widget catalog (see widgets.tsx).
 */

import {
  ArrowRight,
  CalendarClock,
  Landmark,
  Receipt,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { formatMoney } from "../../shared/format";
import { useAuthStore } from "../identity/authStore";
import { useAccountBalances } from "../accounts/hooks";
import { useUpcomingBills } from "../bills/hooks";
import { useGoals, useGoalProjection } from "../goals/hooks";
import { useForecast } from "../forecast/hooks";
import { useNetWorth } from "../networth/hooks";
import { useReport } from "../reports/hooks";
import { useTransactions } from "../transactions/hooks";
import type { LocalGoal } from "../../db/db";

function useCurrency() {
  return useAuthStore((s) => s.user?.defaultCurrency ?? "EUR");
}

/** Current calendar month as an inclusive ISO range. */
function monthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay)}` };
}

function Card({
  title,
  icon,
  to,
  children,
}: {
  title: string;
  icon: ReactNode;
  to?: string;
  children: ReactNode;
}) {
  return (
    <section className="card-panel">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display font-semibold">
          <span className="text-ink-soft">{icon}</span> {title}
        </h2>
        {to && (
          <Link
            to={to}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-soft hover:text-mint"
            aria-label={`Ir a ${title}`}
          >
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Muted({ text }: { text: string }) {
  return <p className="text-sm text-ink-soft">{text}</p>;
}

// --- Widgets -----------------------------------------------------------
function NetWorthWidget() {
  const nw = useNetWorth();
  const currency = useCurrency();
  return (
    <Card title="Patrimonio neto" icon={<Scale size={16} />} to="/net-worth">
      <div className="flex items-center gap-3">
        <span className="font-display text-3xl font-semibold">{formatMoney(nw.netWorth, currency)}</span>
        {nw.growth !== null && (
          <span className={`text-sm font-semibold ${nw.growth >= 0 ? "text-mint" : "text-coral"}`}>
            {nw.growth >= 0 ? "+" : ""}
            {Math.round(nw.growth * 100)}%
          </span>
        )}
      </div>
      <div className="mt-1 flex gap-4 text-xs text-ink-soft">
        <span>Activos {formatMoney(nw.assetsTotal, currency)}</span>
        <span>Pasivos {formatMoney(nw.liabilitiesTotal, currency)}</span>
      </div>
    </Card>
  );
}

function AccountBalancesWidget() {
  const balances = useAccountBalances();
  const currency = useCurrency();
  const total = balances.reduce((s, b) => s + b.balance, 0);
  return (
    <Card title="Saldos de cuentas" icon={<Landmark size={16} />} to="/accounts">
      {balances.length === 0 ? (
        <Muted text="Aún no tienes cuentas." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {balances.slice(0, 5).map(({ account, balance }) => (
            <li key={account.id} className="flex justify-between text-sm">
              <span className="text-ink-soft">{account.name}</span>
              <span className="font-semibold tabular-nums">{formatMoney(balance, account.currency)}</span>
            </li>
          ))}
          <li className="mt-1 flex justify-between border-t border-line pt-1.5 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(total, currency)}</span>
          </li>
        </ul>
      )}
    </Card>
  );
}

function CashFlowWidget() {
  const result = useForecast(30);
  const currency = useCurrency();
  const shortfall = result.minBalance < 0;
  return (
    <Card title="Flujo de caja (30 días)" icon={<TrendingUp size={16} />} to="/forecast">
      <div className="font-display text-2xl font-semibold">{formatMoney(result.endBalance, currency)}</div>
      <p className={`mt-1 text-xs ${shortfall ? "font-semibold text-coral" : "text-ink-soft"}`}>
        Mínimo previsto {formatMoney(result.minBalance, currency)} · {result.minDate}
      </p>
    </Card>
  );
}

function UpcomingBillsWidget() {
  const bills = useUpcomingBills(14);
  return (
    <Card title="Próximos recibos" icon={<CalendarClock size={16} />} to="/bills">
      {bills.length === 0 ? (
        <Muted text="Nada previsto en 14 días." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {bills.slice(0, 4).map((b) => (
            <li key={b.occurrenceId} className="flex justify-between text-sm">
              <span className="text-ink-soft">
                {b.name} · {b.date.slice(5)}
              </span>
              <span className="font-semibold tabular-nums text-coral">
                {formatMoney(b.amount, b.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GoalRow({ goal }: { goal: LocalGoal }) {
  const projection = useGoalProjection(goal);
  const pct = Math.round(projection.progress * 100);
  return (
    <li>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-ink-soft">{goal.name}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-mint" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function GoalsWidget() {
  const goals = useGoals();
  return (
    <Card title="Metas" icon={<Target size={16} />} to="/goals">
      {goals.length === 0 ? (
        <Muted text="Sin metas de ahorro." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {goals.slice(0, 3).map((g) => (
            <GoalRow key={g.id} goal={g} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SpendingThisMonthWidget() {
  const { from, to } = monthRange();
  const report = useReport(from, to);
  const currency = useCurrency();
  return (
    <Card title="Gasto este mes" icon={<TrendingDown size={16} />} to="/reports">
      <div className="font-display text-2xl font-semibold text-coral">
        {formatMoney(report.expenseTotal, currency)}
      </div>
    </Card>
  );
}

function IncomeThisMonthWidget() {
  const { from, to } = monthRange();
  const report = useReport(from, to);
  const currency = useCurrency();
  return (
    <Card title="Ingresos este mes" icon={<TrendingUp size={16} />} to="/reports">
      <div className="font-display text-2xl font-semibold text-mint">
        {formatMoney(report.incomeTotal, currency)}
      </div>
    </Card>
  );
}

function TxSavingsRateWidget() {
  const { from, to } = monthRange();
  const report = useReport(from, to);
  const pct = Math.round(report.savingsRate * 100);
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <Card title="Tasa de ahorro (mes)" icon={<Wallet size={16} />} to="/reports">
      <div className="mb-2 font-display text-2xl font-semibold text-mint">{pct}%</div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-mint" style={{ width: `${clamped}%` }} />
      </div>
    </Card>
  );
}

function RecentTransactionsWidget() {
  const txs = useTransactions({ sort: "date", order: "desc" });
  const sign = { income: 1, expense: -1, transfer: 0 } as const;
  return (
    <Card title="Movimientos recientes" icon={<Receipt size={16} />} to="/transactions">
      {txs.length === 0 ? (
        <Muted text="Aún no hay movimientos." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {txs.slice(0, 5).map((t) => {
            const signed = t.amount * sign[t.type];
            return (
              <li key={t.id} className="flex justify-between text-sm">
                <span className="truncate text-ink-soft">{t.notes || t.date}</span>
                <span
                  className={`font-semibold tabular-nums ${
                    signed > 0 ? "text-mint" : signed < 0 ? "text-coral" : "text-ink-soft"
                  }`}
                >
                  {formatMoney(signed, t.currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function LargestExpensesWidget() {
  const { from, to } = monthRange();
  const report = useReport(from, to);
  const currency = useCurrency();
  return (
    <Card title="Mayores gastos (mes)" icon={<TrendingDown size={16} />} to="/reports">
      {report.largestExpenses.length === 0 ? (
        <Muted text="Sin gastos este mes." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {report.largestExpenses.slice(0, 4).map((t, i) => (
            <li key={i} className="flex justify-between text-sm">
              <span className="text-ink-soft">{t.date.slice(5)}</span>
              <span className="font-semibold tabular-nums text-coral">
                {formatMoney(t.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export const FINANCE_WIDGETS = [
  { id: "netWorth", title: "Patrimonio neto", render: () => <NetWorthWidget /> },
  { id: "accountBalances", title: "Saldos de cuentas", render: () => <AccountBalancesWidget /> },
  { id: "cashFlow", title: "Flujo de caja", render: () => <CashFlowWidget /> },
  { id: "upcomingBills", title: "Próximos recibos", render: () => <UpcomingBillsWidget /> },
  { id: "goalsWidget", title: "Metas", render: () => <GoalsWidget /> },
  { id: "spendingThisMonth", title: "Gasto este mes", render: () => <SpendingThisMonthWidget /> },
  { id: "incomeThisMonth", title: "Ingresos este mes", render: () => <IncomeThisMonthWidget /> },
  { id: "txSavingsRate", title: "Tasa de ahorro (mes)", render: () => <TxSavingsRateWidget /> },
  { id: "recentTransactions", title: "Movimientos recientes", render: () => <RecentTransactionsWidget /> },
  { id: "largestExpenses", title: "Mayores gastos", render: () => <LargestExpensesWidget /> },
];
