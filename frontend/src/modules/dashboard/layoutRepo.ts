/** Local (Dexie-first) read/write for the dashboard layout, with defaults. */

import { useLiveQuery } from "dexie-react-hooks";

import { db, type LayoutData } from "../../db/db";
import { DEFAULT_ORDER } from "./widgets";

export const THEMES = [
  { id: "cuaderno", label: "Cuaderno" },
  { id: "liso", label: "Liso" },
  { id: "carbon", label: "Carbón" },
];

export const DEFAULT_LAYOUT: LayoutData = {
  order: DEFAULT_ORDER,
  hidden: [],
  theme: "cuaderno",
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
    theme: stored.theme ?? "cuaderno",
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
