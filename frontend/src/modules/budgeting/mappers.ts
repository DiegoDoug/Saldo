/**
 * Mapping between the backend's snake_case wire shapes, the local Dexie
 * camelCase rows, and the domain core's MonthInput.
 */

import type { LocalCategory, LocalEntry } from "../../db/db";
import type { MonthInput } from "../../shared/domain/budgeting";
import { makeMonthInput } from "../../shared/domain/budgeting";

// --- Wire shapes (as returned by the API / sync endpoints) --------------
export interface WireCategory {
  id: string;
  name: string;
  kind: "income" | "fixed" | "variable";
  position: number;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  updated_at: string;
  deleted: boolean;
}

export interface WireEntry {
  id: string;
  year: number;
  month: number;
  kind: "income" | "fixed" | "variable" | "goal";
  category_id: string | null;
  label: string;
  amount: number;
  currency: string;
  updated_at: string;
  deleted: boolean;
}

// --- Wire -> Local ------------------------------------------------------
export function wireToLocalCategory(w: WireCategory): LocalCategory {
  return {
    id: w.id,
    name: w.name,
    kind: w.kind,
    position: w.position,
    parentId: w.parent_id ?? null,
    color: w.color ?? null,
    icon: w.icon ?? null,
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function wireToLocalEntry(w: WireEntry): LocalEntry {
  return {
    id: w.id,
    year: w.year,
    month: w.month,
    kind: w.kind,
    categoryId: w.category_id,
    label: w.label,
    amount: w.amount,
    currency: w.currency,
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

// --- Local -> Sync payload (snake_case) ---------------------------------
export function localCategoryToSync(c: LocalCategory) {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    position: c.position,
    parent_id: c.parentId,
    color: c.color,
    icon: c.icon,
    updated_at: c.updatedAt,
    deleted: c.deleted === 1,
  };
}

export function localEntryToSync(e: LocalEntry) {
  return {
    id: e.id,
    year: e.year,
    month: e.month,
    kind: e.kind,
    category_id: e.categoryId,
    label: e.label,
    amount: e.amount,
    currency: e.currency,
    updated_at: e.updatedAt,
    deleted: e.deleted === 1,
  };
}

/**
 * Collapse a month's local entries into the domain core's MonthInput.
 *
 * Single-currency assumption (matching the prototype): amounts are summed
 * as-is. Mixed-currency display would need cached FX rates; the backend's
 * summary endpoints already convert when a view mixes currencies.
 */
export function entriesToMonthInput(entries: LocalEntry[]): MonthInput {
  const live = entries.filter((e) => e.deleted === 0);
  const byKind = (kind: LocalEntry["kind"]) =>
    live.filter((e) => e.kind === kind).map((e) => e.amount);
  return makeMonthInput({
    extras: byKind("income"),
    fixed: byKind("fixed"),
    variable: byKind("variable"),
    savingsGoal: byKind("goal").reduce((s, x) => s + x, 0),
  });
}
