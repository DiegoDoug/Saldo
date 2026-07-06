/** A single month: summary, spend meter, editable income/goal/expense sections
 * (with dynamic category CRUD), and a spending breakdown. */

import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Receipt,
  Repeat,
  Target,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useAuthStore } from "../identity/authStore";
import { formatMoney } from "../../shared/format";
import { C, CATEGORY_COLORS, MONTHS } from "../../shared/theme";
import { MoneyInput } from "../../shared/ui/MoneyInput";
import { BudgetVsActual } from "./BudgetVsActual";
import { CategoryRow } from "./CategoryRow";
import { amountByCategory, useCategories, useMonthResult } from "./hooks";
import { addCategory, setGoal } from "./localRepo";
import { useBudgetingUi } from "./uiStore";

export function MonthView() {
  const params = useParams();
  const navigate = useNavigate();
  const year = useBudgetingUi((s) => s.currentYear);
  const monthIdx = Math.min(11, Math.max(0, Number(params.month ?? 0)));
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? "EUR");

  const categories = useCategories();
  const { entries, result } = useMonthResult(year, monthIdx);
  const amounts = amountByCategory(entries);
  const goal = entries.find((e) => e.deleted === 0 && e.kind === "goal")?.amount ?? 0;

  const income = categories.filter((c) => c.kind === "income");
  const fixed = categories.filter((c) => c.kind === "fixed");
  const variable = categories.filter((c) => c.kind === "variable");

  const breakdown = [...fixed, ...variable]
    .map((c, idx) => ({
      key: c.id,
      label: c.name,
      value: amounts.get(c.id) ?? 0,
      // Prefer the category's own colour; fall back to the rotating palette.
      color: c.color ?? CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
    }))
    .filter((d) => d.value > 0);

  const goToMonth = (delta: number) => navigate(`/month/${(monthIdx + delta + 12) % 12}`);

  const meterPct =
    result.canSpend > 0 ? Math.min(100, (result.expensesTotal / result.canSpend) * 100) : 0;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <IconButton label="Volver" onClick={() => navigate("/")}>
          <ArrowLeft size={18} />
        </IconButton>
        <div className="flex flex-1 items-center justify-center gap-2">
          <IconButton label="Mes anterior" onClick={() => goToMonth(-1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <h1 className="font-display text-2xl font-semibold">
            {MONTHS[monthIdx]} <span className="font-medium text-ink-soft">{year}</span>
          </h1>
          <IconButton label="Mes siguiente" onClick={() => goToMonth(1)}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>

      {/* Summary */}
      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-line bg-card p-5 sm:grid-cols-[1.1fr_1fr] sm:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Ahorro a fin de mes
          </div>
          <div
            className="my-2 font-display text-4xl font-semibold leading-none"
            style={{ color: result.endOfMonthSavings >= 0 ? C.mint : C.coral }}
          >
            {formatMoney(result.endOfMonthSavings)}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              result.metGoal ? "bg-mint-soft text-mint" : "bg-coral-soft text-coral"
            }`}
          >
            {result.metGoal ? (
              <>
                <Check size={13} /> Meta cumplida
              </>
            ) : (
              <>
                <Target size={13} /> Faltan{" "}
                {formatMoney(Math.max(0, result.goal - result.endOfMonthSavings))}
              </>
            )}
          </span>
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-paper p-4">
          <SummaryRow label="Ingresos" value={result.incomeTotal} className="text-mint" />
          <SummaryRow label="Puedo gastar" value={result.canSpend} className="text-ink" />
          <SummaryRow label="Gastado" value={result.expensesTotal} className="text-coral" />
          <div className="my-1 h-px bg-line" />
          <SummaryRow
            strong
            label={result.remainingToSpend >= 0 ? "Disponible" : "Excedido"}
            value={Math.abs(result.remainingToSpend)}
            className={result.remainingToSpend >= 0 ? "text-mint" : "text-coral"}
          />
        </div>
      </section>

      {/* Spend meter */}
      <div className="px-0.5">
        <div className="h-2.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${meterPct}%`, background: result.overspend ? C.coral : C.mint }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] font-medium text-ink-soft">
          <span>{formatMoney(result.expensesTotal)} gastado</span>
          <span>de {formatMoney(result.canSpend)} disponible</span>
        </div>
      </div>

      {/* Income */}
      <Section title="Ingresos" icon={<Wallet size={15} />} accent={C.mint} total={result.incomeTotal}>
        {income.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            amount={amounts.get(c.id) ?? 0}
            year={year}
            month={monthIdx}
            currency={currency}
            accentClassName="text-mint"
          />
        ))}
        <AddButton label="Añadir ingreso" onClick={() => void addCategory("Nuevo ingreso", "income")} />
      </Section>

      {/* Goal */}
      <Section
        title="Cuánto quiero ahorrar"
        icon={<Target size={15} />}
        accent={C.gold}
        total={result.goal}
      >
        <div className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-sm font-medium">Meta de ahorro</span>
          <MoneyInput
            ariaLabel="Meta de ahorro"
            value={goal}
            currency={currency}
            accentClassName="text-gold"
            onCommit={(v) => void setGoal(year, monthIdx, v, currency)}
          />
        </div>
        <p className="pb-2 text-xs text-ink-soft">
          Puedes gastar <strong className="text-gold">{formatMoney(result.canSpend)}</strong> este
          mes manteniendo tu meta.
        </p>
      </Section>

      {/* Fixed */}
      <Section
        title="Gastos fijos"
        icon={<Repeat size={15} />}
        accent={C.blue}
        total={result.fixedTotal}
      >
        {fixed.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            amount={amounts.get(c.id) ?? 0}
            year={year}
            month={monthIdx}
            currency={currency}
            accentClassName="text-coral"
          />
        ))}
        <AddButton label="Añadir gasto fijo" onClick={() => void addCategory("Nuevo gasto", "fixed")} />
      </Section>

      {/* Variable */}
      <Section
        title="Gastos variables"
        icon={<Receipt size={15} />}
        accent={C.lilac}
        total={result.variableTotal}
      >
        {variable.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            amount={amounts.get(c.id) ?? 0}
            year={year}
            month={monthIdx}
            currency={currency}
            accentClassName="text-coral"
          />
        ))}
        <AddButton
          label="Añadir gasto variable"
          onClick={() => void addCategory("Nuevo gasto", "variable")}
        />
      </Section>

      {/* Budget vs actual (uses the month's transactions as actuals) */}
      <BudgetVsActual year={year} month={monthIdx} currency={currency} />

      {/* Breakdown */}
      {breakdown.length > 0 && (
        <section className="card-panel">
          <h2 className="mb-2 font-display font-semibold">Reparto de gastos</h2>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="value"
                nameKey="label"
                innerRadius={58}
                outerRadius={92}
                paddingAngle={2}
                stroke="none"
              >
                {breakdown.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </section>
      )}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card hover:bg-paper"
    >
      {children}
    </button>
  );
}

function SummaryRow({
  label,
  value,
  className,
  strong,
}: {
  label: string;
  value: number;
  className?: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between ${strong ? "text-[15px]" : "text-sm"}`}>
      <span className="font-medium text-ink-soft">{label}</span>
      <span className={`tabular-nums ${strong ? "font-bold" : "font-semibold"} ${className ?? ""}`}>
        {formatMoney(value)}
      </span>
    </div>
  );
}

function Section({
  title,
  icon,
  accent,
  total,
  children,
}: {
  title: string;
  icon: ReactNode;
  accent: string;
  total: number;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2 font-display font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: accent }}>
            {icon}
          </span>
          {title}
        </div>
        <div className="font-display font-semibold tabular-nums">{formatMoney(total)}</div>
      </div>
      <div className="px-4 pb-3">{children}</div>
    </section>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-mint hover:border-mint hover:bg-mint-soft/40"
    >
      <Plus size={15} /> {label}
    </button>
  );
}
