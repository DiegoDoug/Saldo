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
import { Check, Eye, EyeOff, GripVertical, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import type { LayoutData } from "../../db/db";
import { useYearResult } from "../budgeting/hooks";
import { useBudgetingUi } from "../budgeting/uiStore";
import { runLayoutSync } from "./layoutSync";
import { THEMES, saveLayout, useLayout } from "./layoutRepo";
import { WIDGET_BY_ID } from "./widgets";

export function DashboardPage() {
  const year = useBudgetingUi((s) => s.currentYear);
  const calc = useYearResult(year);
  const layout = useLayout();
  const [editing, setEditing] = useState(false);

  async function persist(next: LayoutData) {
    await saveLayout(next);
    void runLayoutSync();
  }

  const visible = layout.order.filter((id) => !layout.hidden.includes(id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <button
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
            editing ? "border-mint bg-mint text-white" : "border-line bg-card text-ink-soft"
          }`}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? <Check size={16} /> : <SlidersHorizontal size={16} />}
          {editing ? "Listo" : "Personalizar"}
        </button>
      </div>

      {editing ? (
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
        <p className="mb-3 text-sm text-ink-soft">Elige el aspecto de tu panel.</p>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange({ ...layout, theme: t.id })}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                layout.theme === t.id ? "border-mint bg-mint-soft text-mint" : "border-line bg-paper"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
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
