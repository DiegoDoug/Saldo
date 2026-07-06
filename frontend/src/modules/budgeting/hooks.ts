/**
 * Reactive reads from Dexie via dexie-react-hooks. Components re-render
 * automatically when the local data changes (including after a background sync
 * merges server updates), keeping Dexie the on-device source of truth.
 */

import { useLiveQuery } from "dexie-react-hooks";

import { db, type LocalCategory, type LocalEntry } from "../../db/db";
import {
  computeMonth,
  computeYear,
  type MonthResult,
  type YearResult,
} from "../../shared/domain/budgeting";
import { entriesToMonthInput } from "./mappers";

export function useCategories(): LocalCategory[] {
  return (
    useLiveQuery(async () => {
      const all = await db.categories.where("deleted").equals(0).toArray();
      return all.sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position);
    }, []) ?? []
  );
}

/** A category with its recursively-nested subcategories. */
export interface CategoryNode extends LocalCategory {
  children: CategoryNode[];
}

/** Assemble live categories into a nested forest, ordered by kind then position. */
export function buildCategoryForest(categories: LocalCategory[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>(
    categories.map((c) => [c.id, { ...c, children: [] }]),
  );
  const roots: CategoryNode[] = [];
  for (const c of categories) {
    const node = nodes.get(c.id)!;
    const parent = c.parentId ? nodes.get(c.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sortRec = (items: CategoryNode[]): void => {
    items.sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position);
    items.forEach((item) => sortRec(item.children));
  };
  sortRec(roots);
  return roots;
}

export function useCategoryTree(): CategoryNode[] {
  const categories = useCategories();
  return buildCategoryForest(categories);
}

export function useMonthEntries(year: number, month: number): LocalEntry[] {
  return (
    useLiveQuery(
      () => db.entries.where("[year+month]").equals([year, month]).toArray(),
      [year, month],
    ) ?? []
  );
}

export function useYearEntries(year: number): LocalEntry[] {
  return useLiveQuery(() => db.entries.where("year").equals(year).toArray(), [year]) ?? [];
}

/** Compute a month's figures from its live entries. */
export function useMonthResult(year: number, month: number): {
  entries: LocalEntry[];
  result: MonthResult;
} {
  const entries = useMonthEntries(year, month);
  return { entries, result: computeMonth(entriesToMonthInput(entries)) };
}

/** Compute a full year from its live entries. */
export function useYearResult(year: number): YearResult {
  const entries = useYearEntries(year);
  const byMonth: LocalEntry[][] = Array.from({ length: 12 }, () => []);
  for (const e of entries) {
    if (e.month >= 0 && e.month <= 11) byMonth[e.month].push(e);
  }
  return computeYear(byMonth.map(entriesToMonthInput));
}

/** Map of categoryId -> amount for a specific month (0 when no entry yet). */
export function amountByCategory(entries: LocalEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.deleted === 0 && e.categoryId) map.set(e.categoryId, e.amount);
  }
  return map;
}

export function goalAmount(entries: LocalEntry[]): number {
  return entries
    .filter((e) => e.deleted === 0 && e.kind === "goal")
    .reduce((s, e) => s + e.amount, 0);
}
