/**
 * The dashboard widget catalog. Each widget is a self-contained card that
 * receives the year's computed figures. The catalog is a fixed set (per the
 * v1 scope); users choose which to show and in what order (see layout).
 */

import {
  BarChart3,
  Calendar,
  Gauge,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonthResult, YearResult } from "../../shared/domain/budgeting";
import { formatMoney } from "../../shared/format";
import { C, MONTHS } from "../../shared/theme";
import { savingsRatePct } from "../budgeting/summary";
import { FINANCE_WIDGETS } from "./financeWidgets";

export interface WidgetProps {
  year: number;
  calc: YearResult;
}

export interface WidgetDef {
  id: string;
  title: string;
  render: (props: WidgetProps) => ReactNode;
}

function HeroWidget({ year, calc }: WidgetProps) {
  const rate = savingsRatePct(calc);
  // Deliberately fixed dark hexes (not theme tokens): this hero card is a
  // dark accent in every theme, and `ink` flips to near-white in oscuro.
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1C2826] to-[#243531] p-6 text-white">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
          Ahorro del año · {year}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/15">
          <Sparkles size={12} /> {rate}%
        </span>
      </div>
      <div className="mt-3 font-display text-5xl font-semibold leading-none tabular-nums">
        {formatMoney(calc.savingsTotal)}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/80">
        <span className="inline-flex items-center gap-1.5">
          <TrendingUp size={14} className="text-mint-soft" /> {formatMoney(calc.incomeTotal)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <TrendingDown size={14} className="text-coral" /> {formatMoney(calc.expensesTotal)}
        </span>
      </div>
    </section>
  );
}

function StatsWidget({ calc }: WidgetProps) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Stat icon={<TrendingUp size={18} />} tone="mint" label="Ingresos del año"
        value={formatMoney(calc.incomeTotal)} />
      <Stat icon={<TrendingDown size={18} />} tone="coral" label="Gastos del año"
        value={formatMoney(calc.expensesTotal)} />
      <Stat icon={<Target size={18} />} tone="ink" label="Meta de ahorro"
        value={formatMoney(calc.goalTotal)} />
    </section>
  );
}

function SavingsRateWidget({ calc }: WidgetProps) {
  const rate = savingsRatePct(calc);
  const clamped = Math.min(100, Math.max(0, rate));
  return (
    <section className="card-panel">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display font-semibold">
          <Gauge size={16} className="text-ink-soft" /> Tasa de ahorro
        </h2>
        <span className="font-display text-2xl font-semibold tabular-nums text-mint">{rate}%</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Tasa de ahorro: ${rate}%`}
      >
        <div className="h-full rounded-full bg-mint transition-[width]" style={{ width: `${clamped}%` }} />
      </div>
      <p className="mt-2 text-xs text-ink-soft">Guardas el {rate}% de lo que ingresas este año.</p>
    </section>
  );
}

function TrendWidget({ calc }: WidgetProps) {
  const navigate = useNavigate();
  const trend = calc.perMonth.map((c, i) => ({
    name: MONTHS[i].slice(0, 3),
    Ingresos: c.incomeTotal,
    Gastos: c.expensesTotal,
    Ahorro: c.endOfMonthSavings,
  }));
  return (
    <section className="card-panel">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display font-semibold">
          <BarChart3 size={16} className="text-ink-soft" /> Evolución mensual
        </h2>
        <button
          className="rounded-lg text-sm font-semibold text-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2"
          onClick={() => navigate("/year")}
        >
          Ver año completo →
        </button>
      </div>
      <p className="sr-only">
        Evolución mensual de ingresos, gastos y ahorro. Ahorro total del año:{" "}
        {formatMoney(calc.savingsTotal)}.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={C.line} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
          <Tooltip formatter={(v: number) => formatMoney(v)} />
          <Line type="monotone" dataKey="Ingresos" stroke={C.mint} strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="Gastos" stroke={C.coral} strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="Ahorro" stroke={C.blue} strokeWidth={2} strokeDasharray="4 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

function MonthsWidget({ year, calc }: WidgetProps) {
  const navigate = useNavigate();
  const now = new Date();
  const currentMonthIdx = now.getFullYear() === year ? now.getMonth() : -1;
  return (
    <section className="card-panel">
      <h2 className="mb-3 flex items-center gap-2 font-display font-semibold">
        <Calendar size={16} className="text-ink-soft" /> Meses
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {calc.perMonth.map((c, i) => (
          <MonthCard
            key={i}
            month={MONTHS[i]}
            result={c}
            current={i === currentMonthIdx}
            onClick={() => navigate(`/month/${i}`)}
          />
        ))}
      </div>
    </section>
  );
}

function MonthCard({
  month,
  result,
  current,
  onClick,
}: {
  month: string;
  result: MonthResult;
  current: boolean;
  onClick: () => void;
}) {
  const meterPct = result.canSpend > 0 ? Math.min(100, (result.expensesTotal / result.canSpend) * 100) : 0;
  return (
    <button
      onClick={onClick}
      aria-label={`${month}: ahorro ${formatMoney(result.endOfMonthSavings)}${result.overspend ? ", gasto excedido" : ""}`}
      className={`rounded-xl border bg-paper p-3 text-left transition hover:-translate-y-0.5 hover:border-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 ${
        current ? "border-mint" : "border-line"
      } ${result.overspend ? "border-coral/50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{month}</span>
        {current && (
          <span className="rounded-lg bg-mint-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-mint">
            Actual
          </span>
        )}
      </div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums">
        {formatMoney(result.endOfMonthSavings)}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold tabular-nums">
        <span className="text-mint">{formatMoney(result.incomeTotal)}</span>
        <span className="text-line">·</span>
        <span className="text-coral">{formatMoney(result.expensesTotal)}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded bg-line">
        <div className="h-full rounded"
          style={{ width: `${meterPct}%`, background: result.overspend ? C.coral : C.mint }} />
      </div>
    </button>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "mint" | "coral" | "ink";
}) {
  const toneClass =
    tone === "mint"
      ? "bg-mint-soft text-mint"
      : tone === "coral"
        ? "bg-coral-soft text-coral"
        : "bg-paper text-ink";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneClass}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-soft">{label}</div>
        <div className="font-display text-lg font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

// Finance widgets first (the app's primary data), then the budgeting widgets.
// Existing users keep their saved order; `resolveLayout` appends any new ids.
export const WIDGET_CATALOG: WidgetDef[] = [
  ...FINANCE_WIDGETS,
  { id: "hero", title: "Resumen del año", render: (p) => <HeroWidget {...p} /> },
  { id: "stats", title: "Estadísticas rápidas", render: (p) => <StatsWidget {...p} /> },
  { id: "savingsRate", title: "Tasa de ahorro (año)", render: (p) => <SavingsRateWidget {...p} /> },
  { id: "trend", title: "Evolución mensual", render: (p) => <TrendWidget {...p} /> },
  { id: "months", title: "Meses", render: (p) => <MonthsWidget {...p} /> },
];

export const DEFAULT_ORDER = WIDGET_CATALOG.map((w) => w.id);
export const WIDGET_BY_ID = new Map(WIDGET_CATALOG.map((w) => [w.id, w]));
