/**
 * Reports screen: spending/income trends, category & merchant analysis, largest
 * purchases, savings rate, and a financial-health score — all computed on-device
 * from the local ledger (offline-first) via the shared reports core.
 */

import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoney } from "../../shared/format";
import { useAuthStore } from "../identity/authStore";
import { useCategories } from "../budgeting/hooks";
import { useMerchants } from "../merchants/hooks";
import { EmptyState } from "../../shared/ui/EmptyState";
import { type KeyTotal } from "../../shared/domain/reports";
import { useReport } from "./hooks";

export function ReportsPage() {
  const report = useReport();
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? "EUR");
  const categories = useCategories();
  const merchants = useMerchants();

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const merchantName = useMemo(() => new Map(merchants.map((m) => [m.id, m.name])), [merchants]);

  if (report.byMonth.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-semibold">Informes</h1>
        <EmptyState
          icon={<BarChart3 size={24} />}
          title="Aún no hay datos"
          message="Registra ingresos y gastos para ver tus tendencias, categorías principales y tu tasa de ahorro."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold">Informes</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Ingresos" value={formatMoney(report.incomeTotal, currency)} tone="mint" />
        <Kpi label="Gastos" value={formatMoney(report.expenseTotal, currency)} tone="coral" />
        <Kpi
          label="Tasa de ahorro"
          value={`${Math.round(report.savingsRate * 100)}%`}
          tone={report.savingsRate >= 0 ? "mint" : "coral"}
        />
        <Kpi label="Salud financiera" value={`${report.healthScore}/100`} tone="ink" />
      </div>

      <div className="card-panel p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Ingresos vs. gastos por mes</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.byMonth.map((m) => ({ ...m, month: m.month.slice(5) }))}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
              <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Breakdown
        title="Gasto por categoría"
        rows={report.spendingByCategory}
        nameOf={(k) => categoryName.get(k) ?? "Sin categoría"}
        currency={currency}
      />
      <Breakdown
        title="Gasto por comercio"
        rows={report.spendingByMerchant}
        nameOf={(k) => merchantName.get(k) ?? "Sin comercio"}
        currency={currency}
      />

      <div className="card-panel flex flex-col gap-2 p-4">
        <h2 className="text-sm font-semibold text-ink-soft">Mayores gastos</h2>
        {report.largestExpenses.map((t, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span>
              {t.date} · {categoryName.get(t.categoryId ?? "") ?? "—"}
            </span>
            <span className="font-display font-semibold text-coral">
              {formatMoney(t.amount, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "mint" | "coral" | "ink" }) {
  const color = tone === "mint" ? "text-mint" : tone === "coral" ? "text-coral" : "text-ink";
  return (
    <div className="card-panel p-3">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`font-display text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  nameOf,
  currency,
}: {
  title: string;
  rows: KeyTotal[];
  nameOf: (key: string) => string;
  currency: string;
}) {
  if (rows.length === 0) return null;
  const max = rows[0].total || 1;
  return (
    <div className="card-panel flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold text-ink-soft">{title}</h2>
      {rows.slice(0, 8).map((row) => (
        <div key={row.key}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{nameOf(row.key)}</span>
            <span className="text-ink-soft">{formatMoney(row.total, currency)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-mint"
              style={{ width: `${(row.total / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
