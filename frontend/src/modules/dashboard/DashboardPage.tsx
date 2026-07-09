/**
 * Customizable dashboard. In normal mode it renders the user's chosen widgets
 * in their chosen order. "Personalizar" opens an edit mode with dnd-kit
 * drag-to-reorder, per-widget visibility toggles, and a theme picker. Every
 * change is written to Dexie first (offline-safe) and pushed to /layout.
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Eye, EyeOff, GripVertical, SlidersHorizontal, Wallet } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { db, type LayoutData } from "../../db/db";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useYearResult } from "../budgeting/hooks";
import { isYearEmpty } from "../budgeting/summary";
import { useBudgetingUi } from "../budgeting/uiStore";
import { runLayoutSync } from "./layoutSync";
import { saveLayout, useLayout } from "./layoutRepo";
import { ThemePicker } from "./ThemePicker";
import { WIDGET_BY_ID } from "./widgets";

export function DashboardPage() {
  const year = useBudgetingUi((s) => s.currentYear);
  const calc = useYearResult(year);
  const layout = useLayout();
  const [editing, setEditing] = useState(false);
  // The dashboard now spans finance data too, so it's only "empty" when there's
  // neither a budget nor any accounts/transactions to show.
  const financeCount =
    useLiveQuery(async () => (await db.accounts.count()) + (await db.transactions.count()), []) ?? 0;
  const empty = isYearEmpty(calc) && financeCount === 0;

  async function persist(next: LayoutData) {
    await saveLayout(next);
    void runLayoutSync();
  }

  const visible = layout.order.filter((id) => !layout.hidden.includes(id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-lg font-semibold">
          {editing ? "Personalizar panel" : "Tu panel"}
        </h1>
        {!empty && (
          <button
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 ${
              editing ? "border-mint bg-mint text-white" : "border-line bg-card text-ink-soft"
            }`}
            aria-pressed={editing}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <Check size={16} /> : <SlidersHorizontal size={16} />}
            {editing ? "Listo" : "Personalizar"}
          </button>
        )}
      </div>

      {empty ? (
        <DashboardEmpty year={year} />
      ) : editing ? (
        <EditPanel layout={layout} onChange={persist} />
      ) : (
        visible.map((id) => {
          const widget = WIDGET_BY_ID.get(id);
          return widget ? <div key={id}>{widget.render({ year, calc })}</div> : null;
        })
      )}
    </div>
  );
}

function DashboardEmpty({ year }: { year: number }) {
  const navigate = useNavigate();
  const now = new Date();
  const startMonth = now.getFullYear() === year ? now.getMonth() : 0;
  return (
    <EmptyState
      icon={<Wallet size={26} />}
      title={`Empieza tu ${year}`}
      message="Aún no has anotado ingresos ni gastos este año. Abre un mes para registrar tu primer presupuesto."
      action={
        <button className="btn-primary mt-1" onClick={() => navigate(`/month/${startMonth}`)}>
          Registrar un mes →
        </button>
      }
    />
  );
}

function EditPanel({
  layout,
  onChange,
}: {
  layout: LayoutData;
  onChange: (next: LayoutData) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = layout.order.indexOf(String(active.id));
    const to = layout.order.indexOf(String(over.id));
    onChange({ ...layout, order: arrayMove(layout.order, from, to) });
  }

  function toggle(id: string) {
    const hidden = layout.hidden.includes(id)
      ? layout.hidden.filter((h) => h !== id)
      : [...layout.hidden, id];
    onChange({ ...layout, hidden });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card-panel">
        <h2 className="mb-1 font-display font-semibold">Tema</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Elige el aspecto de la aplicación: claro, medio u oscuro.
        </p>
        <ThemePicker value={layout.theme} onSelect={(theme) => onChange({ ...layout, theme })} />
      </section>

      <section className="card-panel">
        <h2 className="mb-1 font-display font-semibold">Widgets</h2>
        <p className="mb-3 text-sm text-ink-soft">Arrastra para reordenar, toca el ojo para ocultar.</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={layout.order} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {layout.order.map((id) => (
                <SortableRow
                  key={id}
                  id={id}
                  hidden={layout.hidden.includes(id)}
                  onToggle={() => toggle(id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>
    </div>
  );
}

function SortableRow({
  id,
  hidden,
  onToggle,
}: {
  id: string;
  hidden: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const widget = WIDGET_BY_ID.get(id);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5 ${
        isDragging ? "opacity-70 shadow" : ""
      }`}
    >
      <button
        className="cursor-grab touch-none text-ink-soft"
        aria-label="Reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <span className={`flex-1 text-sm font-medium ${hidden ? "text-ink-soft line-through" : ""}`}>
        {widget?.title ?? id}
      </span>
      <button
        className="grid place-items-center rounded-lg p-1.5 text-ink-soft hover:bg-line/50"
        aria-label={hidden ? "Mostrar" : "Ocultar"}
        onClick={onToggle}
      >
        {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
