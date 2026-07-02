/** Whole-year view: totals, income-vs-expenses bars, and category ranking. */

import { ArrowLeft, BarChart3, Receipt, Sparkles, Wallet } from "lucide-react";
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

import type { YearResult } from "../../shared/domain/budgeting";
import { formatMoney } from "../../shared/format";
import { EmptyState } from "../../shared/ui/EmptyState";
import { C, CATEGORY_COLORS, MONTHS } from "../../shared/theme";
import { useCategories, useYearEntries, useYearResult } from "./hooks";
import { isYearEmpty, rankCategories, savingsRatePct, type RankedCategory } from "./summary";
import { useBudgetingUi } from "./uiStore";

export function YearView() {
  const year = useBudgetingUi((s) => s.currentYear);
  const navigate = useNavigate();
  const calc = useYearResult(year);
  const categories = useCategories();
  const yearEntries = useYearEntries(year);

  const monthly = calc.perMonth.map((c, i) => ({
    name: MONTHS[i].slice(0, 3),
    Ingresos: c.incomeTotal,
    Gastos: c.expensesTotal,
  }));
  const cats = rankCategories(categories, yearEntries);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <button
          aria-label="Volver al panel"
          onClick={() => navigate("/")}
          className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card transition hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-2xl font-semibold">Total {year}</h1>
      </div>

      {isYearEmpty(calc) ? (
        <EmptyState
          icon={<Wallet size={26} />}
          title={`Sin datos de ${year}`}
          message="Cuando registres ingresos y gastos, aquí verás el resumen anual, la evolución mes a mes y el reparto por categoría."
          action={
            <button className="btn-primary mt-1" onClick={() => navigate("/")}>
              Ir al panel →
            </button>
          }
        />
      ) : (
        <>
          <SummaryCard calc={calc} />
          <ChartCard monthly={monthly} savingsTotal={calc.savingsTotal} />
          {cats.length > 0 && <CategoryCard cats={cats} expensesTotal={calc.expensesTotal} />}
        </>
      )}
    </div>
  );
}

function SummaryCard({ calc }: { calc: YearResult }) {
  const rate = savingsRatePct(calc);
  return (
    <section className="grid grid-cols-1 gap-4 rounded-2xl border border-line bg-card p-5 sm:grid-cols-[1.1fr_1fr] sm:items-center">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Ahorro total del año
        </div>
        <div className="my-2 font-display text-4xl font-semibold leading-none tabular-nums text-mint">
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
  );
}

interface MonthlyDatum {
  name: string;
  Ingresos: number;
  Gastos: number;
}

function ChartCard({ monthly, savingsTotal }: { monthly: MonthlyDatum[]; savingsTotal: number }) {
  return (
    <section className="card-panel">
      <h2 className="mb-2 flex items-center gap-2 font-display font-semibold">
        <BarChart3 size={16} className="text-ink-soft" /> Ingresos vs Gastos
      </h2>
      <p className="sr-only">
        Comparativa mensual de ingresos y gastos. Ahorro total del año: {formatMoney(savingsTotal)}.
      </p>
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
  );
}

function CategoryCard({ cats, expensesTotal }: { cats: RankedCategory[]; expensesTotal: number }) {
  return (
    <section className="card-panel">
      <h2 className="mb-3 flex items-center gap-2 font-display font-semibold">
        <Receipt size={16} className="text-ink-soft" /> Gastos por categoría
      </h2>
      <div className="flex flex-col gap-3.5">
        {cats.map((c, i) => (
          <CategoryBar
            key={c.id}
            category={c}
            color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
            pct={expensesTotal > 0 ? (c.total / expensesTotal) * 100 : 0}
          />
        ))}
      </div>
    </section>
  );
}

function CategoryBar({
  category,
  color,
  pct,
}: {
  category: RankedCategory;
  color: string;
  pct: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm font-medium">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded" style={{ background: color }} />
          {category.name}
        </span>
        <span className="font-semibold tabular-nums">{formatMoney(category.total)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1 text-[10px] font-medium text-ink-soft">
        {pct.toFixed(0)}% · {category.kind === "fixed" ? "fijo" : "variable"}
      </div>
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
