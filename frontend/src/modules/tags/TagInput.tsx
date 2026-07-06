/**
 * Multi-select tag input with create-on-type: pick from existing tag names or
 * type a new one and press Enter. Selected tags render as colored, removable
 * chips. Purely controlled — the parent owns the list of names.
 */

import { X } from "lucide-react";
import { useState } from "react";

import { useTagColors, useUsedTagNames } from "./hooks";
import { tagColor } from "./tagColor";

export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const colors = useTagColors();
  const known = useUsedTagNames();
  const suggestions = known
    .filter((n) => !value.includes(n) && n.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, 6);

  const add = (raw: string) => {
    const name = raw.trim();
    if (name && !value.includes(name)) onChange([...value, name]);
    setDraft("");
  };
  const remove = (name: string) => onChange(value.filter((n) => n !== name));

  return (
    <div className="rounded-xl border border-line bg-paper p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
            style={{ background: tagColor(name, colors) }}
          >
            {name}
            <button type="button" aria-label={`Quitar ${name}`} onClick={() => remove(name)}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
          placeholder="Etiquetas…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Añadir etiqueta"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
        />
      </div>
      {draft.trim() && suggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => add(name)}
              className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-soft hover:bg-mint-soft/40"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
