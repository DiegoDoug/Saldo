/**
 * Goals screen: savings goals with a progress bar and projection (months
 * remaining + estimated completion), plus contribute and add. Offline-first
 * (Dexie-first writes); projections use the shared domain core.
 */

import { Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";

import { type GoalKind, type LocalGoal } from "../../db/db";
import { formatMoney, parseAmount } from "../../shared/format";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useGoalProjection, useGoals } from "./hooks";
import { addGoal, contribute, deleteGoal } from "./localRepo";

const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  emergency: "Fondo de emergencia",
  vacation: "Vacaciones",
  house: "Casa",
  car: "Coche",
  custom: "Personalizado",
};

const GOAL_KINDS = Object.keys(GOAL_KIND_LABELS) as GoalKind[];

export function GoalsPage() {
  const goals = useGoals();
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Metas</h1>
        <button
          className="flex items-center gap-1 rounded-xl bg-mint px-3 py-2 text-sm font-semibold text-white"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus size={16} /> Nueva
        </button>
      </header>

      {adding && <AddGoalForm onDone={() => setAdding(false)} />}

      {goals.length === 0 && !adding ? (
        <EmptyState
          icon={<Target size={24} />}
          title="Sin metas todavía"
          message="Crea una meta de ahorro (emergencia, vacaciones, casa…) y sigue tu progreso mes a mes."
          action={
            <button
              className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setAdding(true)}
            >
              Añadir meta
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: LocalGoal }) {
  const projection = useGoalProjection(goal);
  const pct = Math.round(projection.progress * 100);

  function contributeMonthly() {
    if (goal.monthlyContribution > 0) contribute(goal.id, goal.monthlyContribution);
  }

  return (
    <li className="card-panel flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{goal.name}</p>
          <p className="text-xs text-ink-soft">{GOAL_KIND_LABELS[goal.kind]}</p>
        </div>
        <button
          className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-soft hover:text-coral"
          onClick={() => deleteGoal(goal.id)}
          aria-label={`Eliminar ${goal.name}`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <span className="font-display font-semibold">
            {formatMoney(goal.currentAmount, goal.currency)}
          </span>
          <span className="text-ink-soft">de {formatMoney(goal.targetAmount, goal.currency)}</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>
          {projection.remaining > 0
            ? projection.monthsRemaining === null
              ? "Añade una aportación mensual para estimar la fecha"
              : `${projection.monthsRemaining} meses · ${projection.completionDate ?? ""}`
            : "¡Meta conseguida! 🎉"}
        </span>
        {goal.monthlyContribution > 0 && projection.remaining > 0 && (
          <button
            className="rounded-lg bg-mint-soft/60 px-2.5 py-1.5 font-semibold text-mint"
            onClick={contributeMonthly}
          >
            +{formatMoney(goal.monthlyContribution, goal.currency)}
          </button>
        )}
      </div>
    </li>
  );
}

function AddGoalForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GoalKind>("emergency");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [monthly, setMonthly] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const targetAmount = parseAmount(target);
    if (!name.trim() || targetAmount <= 0) return;
    await addGoal({
      name: name.trim(),
      kind,
      targetAmount,
      currentAmount: parseAmount(current),
      monthlyContribution: parseAmount(monthly),
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="card-panel flex flex-col gap-3 p-4">
      <input
        className="field-input"
        placeholder="Nombre de la meta"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nombre de la meta"
        autoFocus
      />
      <select
        className="field-input"
        value={kind}
        onChange={(e) => setKind(e.target.value as GoalKind)}
        aria-label="Tipo de meta"
      >
        {GOAL_KINDS.map((k) => (
          <option key={k} value={k}>
            {GOAL_KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <input
        className="field-input"
        placeholder="Objetivo (p. ej. 5000)"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        inputMode="decimal"
        aria-label="Cantidad objetivo"
      />
      <div className="flex gap-2">
        <input
          className="field-input"
          placeholder="Ahorrado ya (0)"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          inputMode="decimal"
          aria-label="Cantidad actual"
        />
        <input
          className="field-input"
          placeholder="Aportación mensual"
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
          inputMode="decimal"
          aria-label="Aportación mensual"
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
