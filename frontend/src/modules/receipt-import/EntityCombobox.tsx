/**
 * Single-select combobox with create-on-type, for picking an existing
 * merchant/category or creating a new one inline — generalizes `TagInput`'s
 * create-on-type pattern (`tags/TagInput.tsx`) from a multi-select of free
 * text to a single foreign-key selection with a real create action.
 *
 * Selecting "Crear «name»" calls `onCreate` immediately (not deferred to the
 * form's final submit) so the new row behaves like any other option for the
 * rest of the review, per docs/receipt-import/06-frontend-ux-flow.md §2.
 */

import { Check, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface ComboboxOption {
  id: string;
  name: string;
}

export function EntityCombobox({
  label,
  options,
  valueId,
  onSelect,
  onCreate,
  placeholder,
  initialQuery = "",
}: {
  label: string;
  options: ComboboxOption[];
  valueId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string) => Promise<string>;
  placeholder: string;
  /** Shown before a matching option loads, or when there's no id match at
   * all but the AI still extracted a name worth showing (e.g. "Mercadona"
   * with no merchant on file yet). */
  initialQuery?: string;
}) {
  const selected = options.find((o) => o.id === valueId) ?? null;
  const [query, setQuery] = useState(selected?.name || initialQuery);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // `options` come from a Dexie live query and resolve asynchronously — on
  // first render (before they've loaded) `selected` is null even when
  // `valueId` is already a real id, so the `useState` initializer above can
  // miss it. Re-sync once the matching option actually shows up, without
  // clobbering whatever the user is typing (this only fires when `selected`
  // transitions to a real, matching option, not on every keystroke — see
  // the dependency array).
  useEffect(() => {
    if (selected) setQuery(selected.name);
  }, [selected?.id, selected?.name]);

  const trimmed = query.trim();
  const matches = useMemo(
    () =>
      trimmed
        ? options.filter((o) => o.name.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 6)
        : options.slice(0, 6),
    [options, trimmed],
  );
  const exactMatch = options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase());

  function pick(option: ComboboxOption) {
    onSelect(option.id);
    setQuery(option.name);
    setOpen(false);
  }

  function clear() {
    onSelect(null);
    setQuery("");
  }

  async function createAndSelect() {
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const id = await onCreate(trimmed);
      onSelect(id);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1">
        <input
          className="field-input flex-1"
          value={query}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => {
            setQuery(e.target.value);
            onSelect(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Let a click on a dropdown option register before we close it.
            setTimeout(() => setOpen(false), 150);
          }}
        />
        {(selected || query) && (
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-coral"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            Quitar
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-line bg-paper p-1 shadow-lg">
          {matches.map((option) => (
            <button
              key={option.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(option)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-mint-soft/40"
            >
              {option.id === valueId && <Check size={14} className="text-mint" aria-hidden="true" />}
              {option.name}
            </button>
          ))}
          {matches.length === 0 && !trimmed && (
            <p className="px-2 py-1.5 text-xs text-ink-soft">Sin resultados</p>
          )}
          {trimmed && !exactMatch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={createAndSelect}
              disabled={creating}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-mint hover:bg-mint-soft/40 disabled:opacity-50"
            >
              <Plus size={14} aria-hidden="true" />
              {creating ? "Creando…" : `Crear «${trimmed}»`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
