/**
 * Dexie-first data operations. Every mutation writes here immediately (so the
 * UI is offline-safe and instant); the sync engine propagates to the backend in
 * the background. Nothing in here touches the network.
 *
 * `updatedAt` is bumped on every write so last-write-wins sync can order it, and
 * deletions are tombstones (`deleted = 1`) rather than row removals.
 */

import { db, type LocalCategory, type LocalEntry } from "../../db/db";

type Kind = LocalCategory["kind"];

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

// Default categories mirror the prototype's fixed/variable groups plus two
// income lines, seeded on first run so a new user isn't staring at a blank page.
const DEFAULT_CATEGORIES: { name: string; kind: Kind }[] = [
  { name: "Nómina", kind: "income" },
  { name: "Otros", kind: "income" },
  { name: "Alquiler / Hipoteca", kind: "fixed" },
  { name: "Facturas", kind: "fixed" },
  { name: "Suscripciones", kind: "fixed" },
  { name: "Transporte", kind: "fixed" },
  { name: "Supermercado", kind: "variable" },
  { name: "Cafés, comidas…", kind: "variable" },
  { name: "Compras impulsivas", kind: "variable" },
  { name: "Ocio", kind: "variable" },
];

export async function seedDefaultCategoriesIfEmpty(): Promise<void> {
  // The count-then-insert runs in a single rw transaction so two concurrent
  // callers (e.g. a double-invoked bootstrap) can't both pass the empty check
  // and seed duplicates.
  await db.transaction("rw", db.categories, async () => {
    const count = await db.categories.count();
    if (count > 0) return;
    const ts = nowIso();
    await db.categories.bulkPut(
      DEFAULT_CATEGORIES.map((c, i) => ({
        id: newId(),
        name: c.name,
        kind: c.kind,
        position: i,
        parentId: null,
        color: null,
        icon: null,
        updatedAt: ts,
        deleted: 0 as const,
      })),
    );
  });
}

/** Next display position among the categories sharing a parent (null = roots). */
async function nextPositionUnder(parentId: string | null): Promise<number> {
  const siblings = await db.categories.filter((c) => (c.parentId ?? null) === parentId).toArray();
  return siblings.reduce((max, c) => Math.max(max, c.position), -1) + 1;
}

export async function addCategory(
  name: string,
  kind: Kind,
  parentId: string | null = null,
): Promise<void> {
  await db.categories.put({
    id: newId(),
    name,
    kind,
    position: await nextPositionUnder(parentId),
    parentId,
    color: null,
    icon: null,
    updatedAt: nowIso(),
    deleted: 0,
  });
}

/** Add a subcategory that inherits its parent's kind (matching the backend rule). */
export async function addSubcategory(parentId: string, name: string): Promise<void> {
  const parent = await db.categories.get(parentId);
  if (!parent) throw new Error("Parent category not found");
  await addCategory(name, parent.kind, parentId);
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await db.categories.update(id, { name, updatedAt: nowIso() });
}

export async function setCategoryColor(id: string, color: string | null): Promise<void> {
  await db.categories.update(id, { color, updatedAt: nowIso() });
}

/** Persist a new sibling order: position becomes the index in `orderedIds`. */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const ts = nowIso();
  await db.transaction("rw", db.categories, async () => {
    await Promise.all(
      orderedIds.map((id, index) => db.categories.update(id, { position: index, updatedAt: ts })),
    );
  });
}

export async function setCategoryIcon(id: string, icon: string | null): Promise<void> {
  await db.categories.update(id, { icon, updatedAt: nowIso() });
}

export async function deleteCategory(id: string): Promise<void> {
  const ts = nowIso();
  // Collect the category and all its descendants so a whole subtree tombstones
  // together (no orphaned children left pointing at a deleted parent).
  const all = await db.categories.toArray();
  const childrenOf = new Map<string | null, string[]>();
  for (const c of all) {
    const key = c.parentId ?? null;
    (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(c.id);
  }
  const doomed: string[] = [];
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    doomed.push(current);
    stack.push(...(childrenOf.get(current) ?? []));
  }

  await Promise.all(doomed.map((cid) => db.categories.update(cid, { deleted: 1, updatedAt: ts })));
  // Tombstone the categories' entries too, so their amounts stop counting.
  const doomedSet = new Set(doomed);
  const owned = await db.entries
    .filter((e) => e.categoryId !== null && doomedSet.has(e.categoryId))
    .toArray();
  await Promise.all(owned.map((e) => db.entries.update(e.id, { deleted: 1, updatedAt: ts })));
}

async function monthEntries(year: number, month: number): Promise<LocalEntry[]> {
  return db.entries.where("[year+month]").equals([year, month]).toArray();
}

/** Set (or clear) a category's amount for a given month. */
export async function setCategoryAmount(
  category: LocalCategory,
  year: number,
  month: number,
  amount: number,
  currency: string,
): Promise<void> {
  const existing = (await monthEntries(year, month)).find(
    (e) => e.categoryId === category.id && e.deleted === 0,
  );
  if (existing) {
    await db.entries.update(existing.id, { amount, updatedAt: nowIso() });
    return;
  }
  await db.entries.put({
    id: newId(),
    year,
    month,
    kind: category.kind,
    categoryId: category.id,
    label: category.name,
    amount,
    currency,
    updatedAt: nowIso(),
    deleted: 0,
  });
}

/** Set the month's savings goal (a single kind="goal" entry, no category). */
export async function setGoal(
  year: number,
  month: number,
  amount: number,
  currency: string,
): Promise<void> {
  const existing = (await monthEntries(year, month)).find(
    (e) => e.kind === "goal" && e.deleted === 0,
  );
  if (existing) {
    await db.entries.update(existing.id, { amount, updatedAt: nowIso() });
    return;
  }
  await db.entries.put({
    id: newId(),
    year,
    month,
    kind: "goal",
    categoryId: null,
    label: "Meta de ahorro",
    amount,
    currency,
    updatedAt: nowIso(),
    deleted: 0,
  });
}
