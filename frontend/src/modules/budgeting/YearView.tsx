/** Whole-year view: totals, income-vs-expenses bars, and category ranking. */

import { ArrowLeft, BarChart3, Receipt, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney } from "../../shared/format";
import { C, CATEGORY_COLORS, MONTHS } from "../../shared/theme";
import { useCategories, useYearEntries, useYearResult } from "./hooks";
import { useBudgetingUi } from "./uiStore";

export function YearView() {
  const year = useBudgetingUi((s) => s.currentYear);
  const navigate = useNavigate();
  const calc = useYearResult(year);
  const categories = useCategories();
  const yearEntries = useYearEntries(year);

  const rate =
    calc.incomeTotal > 0 ? Math.round((calc.savingsTotal / calc.incomeTotal) * 100) : 0;

  const monthly = calc.perMonth.map((c, i) => ({
    name: MONTHS[i].slice(0, 3),
    Ingresos: c.incomeTotal,
    Gastos: c.expensesTotal,
  }));

  const catTotals = new Map<string, number>();
  for (const e of yearEntries) {
    if (e.deleted === 0 && e.categoryId && (e.kind === "fixed" || e.kind === "variable")) {
      catTotals.set(e.categoryId, (catTotals.get(e.categoryId) ?? 0) + e.amount);
    }
  }
  const cats = categories
    .filter((c) => c.kind === "fixed" || c.kind === "variable")
    .map((c) => ({ ...c, total: catTotals.get(c.id) ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <button
          aria-label="Volver"
          onClick={() => navigate("/")}
          className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card hover:bg-paper"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-2xl font-semibold">Total {year}</h1>
      </div>

      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-line bg-card p-5 sm:grid-cols-[1.1fr_1fr] sm:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Ahorro total del año
          </div>
          <div className="my-2 font-display text-4xl font-semibold leading-none text-mint">
            {formatMoney(calc.savingsTotal)}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-soft px-3 py-1.5 text-xs font-semibold text-mint">
            <Sparkles size={13} /> Tasa de ahorro {rate}%
          </span>
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-paper p-4 text-sm">
          <Row label="Ingresos" value={calc.incomeTotal} className="text-mint" />
          <Row label="Gastos" value={calc.expensesTotal} className="text-coral" />
          <Row label="Meta marcada" value={calc.goalTotal} className="text-ink" />
          <div className="my-1 h-px bg-line" />
          <Row label="Fijos" value={calc.fixedTotal} className="text-blue" />
          <Row label="Variables" value={calc.variableTotal} className="text-lilac" />
        </div>
      </section>

      <section className="card-panel">
        <h2 className="mb-2 flex items-center gap-2 font-display font-semibold">
          <BarChart3 size={16} className="text-ink-soft" /> Ingresos vs Gastos
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={C.line} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false}
              tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
            <Tooltip formatter={(v: number) => formatMoney(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Ingresos" fill={C.mint} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gastos" fill={C.coral} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {cats.length > 0 && (
        <section className="card-panel">
          <h2 className="mb-3 flex items-center gap-2 font-display font-semibold">
            <Receipt size={16} className="text-ink-soft" /> Gastos por categoría
          </h2>
          <div className="flex flex-col gap-3.5">
            {cats.map((c, i) => {
              const pct = calc.expensesTotal > 0 ? (c.total / calc.expensesTotal) * 100 : 0;
              const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
              return (
                <div key={c.id}>
                  <div className="mb-1.5 flex justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded" style={{ background: color }} />
                      {c.name}
                    </span>
                    <span className="font-semibold tabular-nums">{formatMoney(c.total)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="mt-1 text-[10px] font-medium text-ink-soft">
                    {pct.toFixed(0)}% · {c.kind === "fixed" ? "fijo" : "variable"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="font-medium text-ink-soft">{label}</span>
      <span className={`font-semibold tabular-nums ${className ?? ""}`}>{formatMoney(value)}</span>
    </div>
  );
}
