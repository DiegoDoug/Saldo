/**
 * Dexie (IndexedDB) schema — the on-device source of truth.
 *
 * Mirrors the backend's Category / Entry / User shapes so a record round-trips
 * through sync unchanged. Every write in the app lands here first (offline-safe)
 * and reconciles with the backend in the background (Stages 7–8).
 *
 * Dexie can't index booleans, so `deleted` is stored as 0/1. Timestamps are ISO
 * strings (the same `updated_at` the sync endpoints compare on).
 */

import Dexie, { type Table } from "dexie";

export interface LocalCategory {
  id: string;
  name: string;
  kind: "income" | "fixed" | "variable";
  position: number;
  updatedAt: string;
  deleted: 0 | 1;
}

export interface LocalEntry {
  id: string;
  year: number;
  month: number; // 0-11
  kind: "income" | "fixed" | "variable" | "goal";
  categoryId: string | null;
  label: string;
  amount: number;
  currency: string;
  updatedAt: string;
  deleted: 0 | 1;
}

/** Mirror of the authenticated User (one row: the current profile). */
export interface LocalProfile {
  id: string;
  email: string;
  defaultCurrency: string;
}

/** Key/value store for sync bookkeeping (e.g. last pull timestamp). */
export interface LocalMeta {
  key: string;
  value: string;
}

/** Dashboard widget layout + theme (a single row keyed by "me"). */
export interface LocalLayout {
  id: string; // always "me"
  data: LayoutData;
  updatedAt: string;
}

export interface LayoutData {
  /** Widget ids in display order. */
  order: string[];
  /** Widget ids the user has hidden. */
  hidden: string[];
  /** Selected theme id. */
  theme: string;
}

export class SaldoDB extends Dexie {
  categories!: Table<LocalCategory, string>;
  entries!: Table<LocalEntry, string>;
  profile!: Table<LocalProfile, string>;
  meta!: Table<LocalMeta, string>;
  layout!: Table<LocalLayout, string>;

  constructor() {
    super("saldo");
    this.version(1).stores({
      categories: "id, kind, deleted, updatedAt",
      entries: "id, [year+month], year, month, kind, deleted, updatedAt",
      profile: "id",
      meta: "key",
    });
    this.version(2).stores({
      layout: "id",
    });
  }
}

export const db = new SaldoDB();
