/**
 * Category manager: a per-kind tree of categories with inline rename, add
 * subcategory, colour + icon pickers, and delete. Reads live from Dexie and
 * writes through localRepo (offline-first). The kind of a subcategory is
 * inherited from its root, matching the backend rule.
 */

import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Palette,
  Plus,
  Receipt,
  Repeat,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";

import { C, CATEGORY_COLORS } from "../../shared/theme";
import { CATEGORY_ICON_NAMES, categoryIcon } from "./categoryIcons";
import { type CategoryNode, useCategoryTree } from "./hooks";
import {
  addCategory,
  addSubcategory,
  deleteCategory,
  renameCategory,
  setCategoryColor,
  setCategoryIcon,
} from "./localRepo";

type Kind = "income" | "fixed" | "variable";

const KINDS: { kind: Kind; title: string; icon: ReactNode; accent: string }[] = [
  { kind: "income", title: "Ingresos", icon: <Wallet size={15} />, accent: C.mint },
  { kind: "fixed", title: "Gastos fijos", icon: <Repeat size={15} />, accent: C.blue },
  { kind: "variable", title: "Gastos variables", icon: <Receipt size={15} />, accent: C.lilac },
];

export function CategoryManager() {
  const navigate = useNavigate();
  const forest = useCategoryTree();

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <button
          aria-label="Volver"
          onClick={() => navigate(-1)}
          className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card hover:bg-paper"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-2xl font-semibold">Categorías</h1>
      </div>

      {KINDS.map(({ kind, title, icon, accent }) => (
        <section key={kind} className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="flex items-center gap-2 px-4 pb-2 pt-4 font-display font-semibold">
            <span
              className="grid h-7 w-7 place-items-center rounded-lg text-white"
              style={{ background: accent }}
            >
              {icon}
            </span>
            {title}
          </div>
          <div className="px-4 pb-3">
            {forest
              .filter((node) => node.kind === kind)
              .map((node) => (
                <CategoryTreeRow key={node.id} node={node} depth={0} />
              ))}
            <button
              onClick={() => void addCategory("Nueva categoría", kind)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-mint hover:border-mint hover:bg-mint-soft/40"
            >
              <Plus size={15} /> Añadir categoría
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

function CategoryTreeRow({ node, depth }: { node: CategoryNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const [name, setName] = useState(node.name);
  const [picking, setPicking] = useState(false);
  const Icon = categoryIcon(node.icon);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 border-t border-line py-2.5 first:border-t-0"
        style={{ paddingLeft: depth * 18 }}
      >
        <button
          aria-label={hasChildren ? (expanded ? "Contraer" : "Expandir") : undefined}
          onClick={() => hasChildren && setExpanded((v) => !v)}
          className={`grid h-5 w-5 shrink-0 place-items-center text-ink-soft ${
            hasChildren ? "hover:text-ink" : "invisible"
          }`}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>

        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
          style={{
            background: node.color ? `${node.color}22` : C.paper,
            color: node.color ?? C.inkSoft,
          }}
        >
          {Icon ? <Icon size={15} /> : <span className="text-xs font-bold">{node.name[0] ?? "·"}</span>}
        </span>

        <input
          className="min-w-0 flex-1 border-b border-dashed border-transparent bg-transparent text-sm font-medium outline-none focus:border-line"
          aria-label={`Nombre de ${node.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== node.name) void renameCategory(node.id, trimmed);
            else setName(node.name);
          }}
        />

        <RowButton label={`Color e icono de ${node.name}`} onClick={() => setPicking((v) => !v)}>
          <Palette size={15} />
        </RowButton>
        <RowButton
          label={`Añadir subcategoría a ${node.name}`}
          onClick={() => void addSubcategory(node.id, "Nueva subcategoría")}
        >
          <Plus size={15} />
        </RowButton>
        <RowButton
          label={`Eliminar ${node.name}`}
          danger
          onClick={() => void deleteCategory(node.id)}
        >
          <Trash2 size={15} />
        </RowButton>
      </div>

      {picking && (
        <StylePicker
          node={node}
          onClose={() => setPicking(false)}
          style={{ marginLeft: depth * 18 }}
        />
      )}

      {expanded &&
        node.children.map((child) => (
          <CategoryTreeRow key={child.id} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

function StylePicker({
  node,
  onClose,
  style,
}: {
  node: CategoryNode;
  onClose: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="mb-2 rounded-xl border border-line bg-paper p-3" style={style}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Color</span>
        <button aria-label="Cerrar" onClick={onClose} className="text-ink-soft hover:text-ink">
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Swatch
          selected={!node.color}
          onClick={() => void setCategoryColor(node.id, null)}
          aria-label="Sin color"
        />
        {CATEGORY_COLORS.map((color) => (
          <Swatch
            key={color}
            color={color}
            selected={node.color === color}
            onClick={() => void setCategoryColor(node.id, color)}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>

      <div className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Icono
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          aria-label="Sin icono"
          onClick={() => void setCategoryIcon(node.id, null)}
          className={`grid h-8 w-8 place-items-center rounded-lg border text-ink-soft ${
            !node.icon ? "border-mint bg-mint-soft/60" : "border-line bg-card hover:bg-paper"
          }`}
        >
          <X size={14} />
        </button>
        {CATEGORY_ICON_NAMES.map((iconName) => {
          const Icon = categoryIcon(iconName)!;
          const selected = node.icon === iconName;
          return (
            <button
              key={iconName}
              aria-label={iconName}
              aria-pressed={selected}
              onClick={() => void setCategoryIcon(node.id, iconName)}
              className={`grid h-8 w-8 place-items-center rounded-lg border ${
                selected ? "border-mint bg-mint-soft/60 text-mint" : "border-line bg-card text-ink hover:bg-paper"
              }`}
            >
              <Icon size={15} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Swatch({
  color,
  selected,
  onClick,
  "aria-label": ariaLabel,
}: {
  color?: string;
  selected: boolean;
  onClick: () => void;
  "aria-label": string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={onClick}
      className={`h-8 w-8 rounded-lg border-2 ${selected ? "border-ink" : "border-line"}`}
      style={{ background: color ?? C.card }}
    >
      {!color && <X size={14} className="mx-auto text-ink-soft" />}
    </button>
  );
}

function RowButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`grid shrink-0 place-items-center rounded-lg p-1.5 text-ink-soft ${
        danger ? "hover:bg-coral-soft hover:text-coral" : "hover:bg-paper hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
