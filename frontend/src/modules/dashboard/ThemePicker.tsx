/** Theme selector shared by the dashboard's "Personalizar" panel and the
 * profile page. Each option previews its palette with three swatch dots. */

import { Check } from "lucide-react";

import { THEMES } from "./layoutRepo";

export function ThemePicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (themeId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tema">
      {THEMES.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              active ? "border-mint bg-mint-soft text-mint" : "border-line bg-paper text-ink-soft"
            }`}
          >
            <span className="flex items-center -space-x-1">
              {t.swatch.map((hex) => (
                <span
                  key={hex}
                  className="h-4 w-4 rounded-full border border-line"
                  style={{ background: hex }}
                />
              ))}
            </span>
            {t.label}
            {active && <Check size={14} />}
          </button>
        );
      })}
    </div>
  );
}
