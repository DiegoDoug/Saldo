/**
 * The dashboard widget catalog. Each widget is a self-contained card that
 * receives the year's computed figures. The catalog is a fixed set (per the
 * v1 scope); users choose which to show and in what order (see layout).
 */

import { BarChart3, Calendar, Gauge, Target, TrendingDown, TrendingUp } from "lucide-react";
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

import type { YearResult } from "../../shared/domain/budgeting";
import { formatMoney } from "../../shared/format";
import { C, MONTHS } from "../../shared/theme";

export interface WidgetProps {
  year: number;
  calc: YearResult;
}

export interface WidgetDef {
  id: string;
  title: string;
  render: (props: WidgetProps) => ReactNode;
}

function savingsRate(calc: YearResult): number {
  return calc.incomeTotal > 0 ? Math.round((calc.savingsTotal / calc.incomeTotal) * 100) : 0;
}

function HeroWidget({ year, calc }: WidgetProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink to-[#243531] p-6 text-white">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
        Resumen del año · {year}
      </div>
      <h1 className="mt-2 font-display text-5xl font-semibold leading-none">
        {formatMoney(calc.savingsTotal)}
      </h1>
      <p className="mt-1 text-sm text-white/80">
        ahorrado este año · tasa de ahorro {savingsRate(calc)}%
      </p>
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
  const rate = savingsRate(calc);
  return (
    <section className="card-panel">
      <h2 className="mb-2 flex items-center gap-2 font-display font-semibold">
        <Gauge size={16} className="text-ink-soft" /> Tasa de ahorro
      </h2>
      <div className="font-display text-3xl font-semibold text-mint">{rate}%</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(100, Math.max(0, rate))}%` }} />
      </div>
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
        <button className="text-sm font-semibold text-mint" onClick={() => navigate("/year")}>
          Ver año completo →
        </button>
      </div>
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
        {calc.perMonth.map((c, i) => {
          const meterPct = c.canSpend > 0 ? Math.min(100, (c.expensesTotal / c.canSpend) * 100) : 0;
          return (
            <button
              key={i}
              onClick={() => navigate(`/month/${i}`)}
              className={`rounded-xl border bg-paper p-3 text-left transition hover:-translate-y-0.5 hover:border-mint ${
                i === currentMonthIdx ? "border-mint" : "border-line"
              } ${c.overspend ? "border-coral/50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{MONTHS[i]}</span>
                {i === currentMonthIdx && (
                  <span className="rounded-lg bg-mint-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-mint">
                    Actual
                  </span>
                )}
              </div>
              <div className="mt-1 font-display text-xl font-semibold">
                {formatMoney(c.endOfMonthSavings)}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold">
                <span className="text-mint">{formatMoney(c.incomeTotal)}</span>
                <span className="text-line">·</span>
                <span className="text-coral">{formatMoney(c.expensesTotal)}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded bg-line">
                <div className="h-full rounded"
                  style={{ width: `${meterPct}%`, background: c.overspend ? C.coral : C.mint }} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
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
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${toneClass}`}>{icon}</div>
      <div>
        <div className="text-xs font-medium text-ink-soft">{label}</div>
        <div className="font-display text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}

export const WIDGET_CATALOG: WidgetDef[] = [
  { id: "hero", title: "Resumen del año", render: (p) => <HeroWidget {...p} /> },
  { id: "stats", title: "Estadísticas rápidas", render: (p) => <StatsWidget {...p} /> },
  { id: "savingsRate", title: "Tasa de ahorro", render: (p) => <SavingsRateWidget {...p} /> },
  { id: "trend", title: "Evolución mensual", render: (p) => <TrendWidget {...p} /> },
  { id: "months", title: "Meses", render: (p) => <MonthsWidget {...p} /> },
];

export const DEFAULT_ORDER = WIDGET_CATALOG.map((w) => w.id);
export const WIDGET_BY_ID = new Map(WIDGET_CATALOG.map((w) => [w.id, w]));
