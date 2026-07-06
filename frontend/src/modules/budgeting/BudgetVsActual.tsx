/**
 * Per-category budget-vs-actual bars for a month. The budget is each category's
 * `Entry` amount; the actual is the month's categorized transactions. Both come
 * from the pure `useMonthVariance` hook (offline-first), so this is presentation
 * only. Over-budget categories turn coral; the rest use the category's colour.
 */

import { TrendingUp } from "lucide-react";
import { useMemo } from "react";

import { formatMoney } from "../../shared/format";
import { C } from "../../shared/theme";
import { categoryIcon } from "./categoryIcons";
import { useCategories, useMonthVariance } from "./hooks";

export function BudgetVsActual({
  year,
  month,
  currency,
}: {
  year: number;
  month: number;
  currency: string;
}) {
  const variance = useMonthVariance(year, month);
  const categories = useCategories();
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Only categories with a budget or some spend are worth a bar; biggest first.
  const rows = Object.entries(variance.byCategory)
    .filter(([, v]) => v.budgeted > 0 || v.actual > 0)
    .sort((a, b) => b[1].budgeted - a[1].budgeted || b[1].actual - a[1].actual);

  if (rows.length === 0) return null;

  return (
    <section className="card-panel">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display font-semibold">
          <TrendingUp size={16} /> Presupuesto vs real
        </h2>
        <span
          className={`text-sm font-semibold tabular-nums ${
            variance.remainingTotal >= 0 ? "text-mint" : "text-coral"
          }`}
        >
          {variance.remainingTotal >= 0 ? "Queda " : "Excedido "}
          {formatMoney(Math.abs(variance.remainingTotal), currency)}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map(([id, v]) => {
          const category = byId.get(id);
          const Icon = categoryIcon(category?.icon);
          const color = category?.color ?? C.mint;
          const pct = v.budgeted > 0 ? Math.min(100, (v.actual / v.budgeted) * 100) : 100;
          const barColor = v.over ? C.coral : color;
          return (
            <div key={id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  {Icon && (
                    <span style={{ color }}>
                      <Icon size={14} />
                    </span>
                  )}
                  <span className="truncate">{category?.name ?? "Sin categoría"}</span>
                </span>
                <span className="shrink-0 tabular-nums text-ink-soft">
                  <strong className={v.over ? "text-coral" : "text-ink"}>
                    {formatMoney(v.actual, currency)}
                  </strong>
                  {v.budgeted > 0 && <> / {formatMoney(v.budgeted, currency)}</>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: barColor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
