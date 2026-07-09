/** Local (Dexie-first) read/write for the dashboard layout, with defaults. */

import { useLiveQuery } from "dexie-react-hooks";

import { db, type LayoutData } from "../../db/db";
import { DEFAULT_ORDER } from "./widgets";

export interface ThemeDef {
  id: string;
  label: string;
  /** Swatches for the picker (paper / accent / ink of that theme). */
  swatch: [string, string, string];
}

/** Light → medium → dark, all on the app's mint/paper palette (see index.css). */
export const THEMES: ThemeDef[] = [
  { id: "claro", label: "Claro", swatch: ["#FBF7F0", "#2F8F6F", "#1C2826"] },
  { id: "medio", label: "Medio", swatch: ["#E2DAC8", "#287D61", "#26332F"] },
  { id: "oscuro", label: "Oscuro", swatch: ["#15201D", "#3DA480", "#E6EFEB"] },
];

const DEFAULT_THEME = THEMES[0].id;

/** Pre-2026-07 theme ids, mapped onto their closest current equivalent. */
const LEGACY_THEME_IDS: Record<string, string> = {
  cuaderno: "claro",
  liso: "medio",
  carbon: "oscuro",
};

export function resolveThemeId(theme: string | undefined): string {
  if (!theme) return DEFAULT_THEME;
  const mapped = LEGACY_THEME_IDS[theme] ?? theme;
  return THEMES.some((t) => t.id === mapped) ? mapped : DEFAULT_THEME;
}

export const DEFAULT_LAYOUT: LayoutData = {
  order: DEFAULT_ORDER,
  hidden: [],
  theme: DEFAULT_THEME,
};

/** Normalize a stored layout against the current catalog (new widgets appended,
 * unknown ids dropped) so upgrades never leave a widget unreachable. */
export function resolveLayout(stored?: LayoutData | null): LayoutData {
  if (!stored) return DEFAULT_LAYOUT;
  const order = stored.order.filter((id) => DEFAULT_ORDER.includes(id));
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
  return {
    order,
    hidden: (stored.hidden ?? []).filter((id) => DEFAULT_ORDER.includes(id)),
    theme: resolveThemeId(stored.theme),
  };
}

export function useLayout(): LayoutData {
  return (
    useLiveQuery(async () => resolveLayout((await db.layout.get("me"))?.data), []) ?? DEFAULT_LAYOUT
  );
}

export async function saveLayout(data: LayoutData): Promise<void> {
  await db.layout.put({ id: "me", data, updatedAt: new Date().toISOString() });
}
