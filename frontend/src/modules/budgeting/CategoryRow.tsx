/** One editable category line: rename inline, set the month amount, delete. */

import { Trash2 } from "lucide-react";
import { useState } from "react";

import type { LocalCategory } from "../../db/db";
import { MoneyInput } from "../../shared/ui/MoneyInput";
import { deleteCategory, renameCategory, setCategoryAmount } from "./localRepo";

export function CategoryRow({
  category,
  amount,
  year,
  month,
  currency,
  accentClassName,
}: {
  category: LocalCategory;
  amount: number;
  year: number;
  month: number;
  currency: string;
  accentClassName?: string;
}) {
  const [name, setName] = useState(category.name);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
      <input
        className="min-w-0 flex-1 border-b border-dashed border-transparent bg-transparent text-sm font-medium outline-none focus:border-line"
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
        <MoneyInput
          ariaLabel={category.name}
          value={amount}
          currency={currency}
          accentClassName={accentClassName}
          onCommit={(v) => void setCategoryAmount(category, year, month, v, currency)}
        />
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
