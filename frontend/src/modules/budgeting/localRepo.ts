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
  const count = await db.categories.count();
  if (count > 0) return;
  const ts = nowIso();
  await db.categories.bulkPut(
    DEFAULT_CATEGORIES.map((c, i) => ({
      id: newId(),
      name: c.name,
      kind: c.kind,
      position: i,
      updatedAt: ts,
      deleted: 0 as const,
    })),
  );
}

export async function addCategory(name: string, kind: Kind): Promise<void> {
  const siblings = await db.categories.where("kind").equals(kind).toArray();
  const position = siblings.reduce((max, c) => Math.max(max, c.position), -1) + 1;
  await db.categories.put({
    id: newId(),
    name,
    kind,
    position,
    updatedAt: nowIso(),
    deleted: 0,
  });
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await db.categories.update(id, { name, updatedAt: nowIso() });
}

export async function deleteCategory(id: string): Promise<void> {
  const ts = nowIso();
  await db.categories.update(id, { deleted: 1, updatedAt: ts });
  // Tombstone the category's entries too, so its amounts stop counting.
  const owned = await db.entries.filter((e) => e.categoryId === id).toArray();
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
