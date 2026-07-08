/** One editable category line: rename inline, set the month amount, delete. */

import { Trash2 } from "lucide-react";
import { useState } from "react";

import type { LocalCategory } from "../../db/db";
import { formatMoney } from "../../shared/format";
import { CATEGORY_INDENT_PX } from "../../shared/theme";
import { MoneyInput } from "../../shared/ui/MoneyInput";
import { deleteCategory, renameCategory, setCategoryAmount } from "./localRepo";

export function CategoryRow({
  category,
  amount,
  year,
  month,
  currency,
  accentClassName,
  depth = 0,
  readOnly = false,
}: {
  category: LocalCategory;
  amount: number;
  year: number;
  month: number;
  currency: string;
  accentClassName?: string;
  /** Nesting depth under a parent category; indents the row. */
  depth?: number;
  /** True when `amount` is a computed rollup of subcategories, not an editable entry. */
  readOnly?: boolean;
}) {
  const [name, setName] = useState(category.name);

  return (
    <div
      className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0"
      style={depth > 0 ? { paddingLeft: depth * CATEGORY_INDENT_PX } : undefined}
    >
      <input
        className={`min-w-0 flex-1 border-b border-dashed border-transparent bg-transparent text-sm outline-none focus:border-line ${
          readOnly ? "font-semibold" : "font-medium"
        }`}
        aria-label={`Nombre de ${category.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed && trimmed !== category.name) void renameCategory(category.id, trimmed);
          else setName(category.name);
        }}
      />
      <div className="flex items-center gap-1">
        {readOnly ? (
          <span
            aria-label={category.name}
            className={`w-32 px-3 py-2 text-right text-sm font-semibold tabular-nums ${accentClassName ?? ""}`}
          >
            {formatMoney(amount, currency)}
          </span>
        ) : (
          <MoneyInput
            ariaLabel={category.name}
            value={amount}
            currency={currency}
            accentClassName={accentClassName}
            onCommit={(v) => void setCategoryAmount(category, year, month, v, currency)}
          />
        )}
        <button
          className="grid place-items-center rounded-lg p-1.5 text-ink-soft hover:bg-coral-soft hover:text-coral"
          aria-label={`Eliminar ${category.name}`}
          onClick={() => void deleteCategory(category.id)}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
