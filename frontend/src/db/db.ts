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
  parentId: string | null; // null = a root category
  color: string | null; // hex, e.g. #6EE7B7
  icon: string | null; // lucide icon name
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

export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "investment"
  | "crypto";

export interface LocalAccount {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  color: string;
  icon: string;
  position: number;
  archived: 0 | 1; // Dexie can't index booleans
  updatedAt: string;
  deleted: 0 | 1;
}

export type TransactionType = "income" | "expense" | "transfer";

export interface LocalTransaction {
  id: string;
  type: TransactionType;
  amount: number; // positive magnitude; sign derives from `type`
  currency: string;
  accountId: string;
  transferAccountId: string | null;
  merchantId: string | null;
  recurringId: string | null;
  categoryId: string | null;
  splitParent: 0 | 1; // 1 = a split container, excluded from money sums
  parentId: string | null; // set on a split child, points at its parent
  date: string; // ISO date (YYYY-MM-DD)
  notes: string;
  tags: string[];
  updatedAt: string;
  deleted: 0 | 1;
}

export type AssetKind = "cash" | "property" | "vehicle" | "investment" | "crypto" | "other";

export interface LocalAsset {
  id: string;
  name: string;
  kind: AssetKind;
  value: number;
  currency: string;
  updatedAt: string;
  deleted: 0 | 1;
}

export type LiabilityKind = "mortgage" | "loan" | "credit_card" | "student" | "other";

export interface LocalLiability {
  id: string;
  name: string;
  kind: LiabilityKind;
  balance: number;
  currency: string;
  interestRate: number;
  updatedAt: string;
  deleted: 0 | 1;
}

export interface LocalNetWorthSnapshot {
  id: string;
  date: string; // ISO date (one per day)
  assetsTotal: number;
  liabilitiesTotal: number;
  netWorth: number;
  currency: string;
  updatedAt: string;
  deleted: 0 | 1;
}

export type GoalKind = "emergency" | "vacation" | "house" | "car" | "custom";

export interface LocalGoal {
  id: string;
  name: string;
  kind: GoalKind;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  currency: string;
  targetDate: string | null;
  updatedAt: string;
  deleted: 0 | 1;
}

export type Frequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface LocalRecurringRule {
  id: string;
  name: string;
  type: TransactionType;
  amount: number;
  currency: string;
  accountId: string;
  transferAccountId: string | null;
  merchantId: string | null;
  categoryId: string | null;
  notes: string;
  frequency: Frequency;
  interval: number;
  startDate: string; // ISO date
  endDate: string | null;
  nextRun: string; // ISO date cursor
  autoGenerate: 0 | 1;
  updatedAt: string;
  deleted: 0 | 1;
}

export interface LocalMerchant {
  id: string;
  name: string;
  logo: string;
  color: string;
  categoryId: string | null;
  website: string;
  location: string;
  recurringProbability: number; // 0..1
  updatedAt: string;
  deleted: 0 | 1;
}

/**
 * A tag registry row: gives a tag name a stable colour and manageable identity.
 * A transaction's membership stays in its `tags: string[]` (by name); this table
 * is the palette/registry behind those names.
 */
export interface LocalTag {
  id: string;
  name: string;
  color: string;
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
  accounts!: Table<LocalAccount, string>;
  transactions!: Table<LocalTransaction, string>;
  merchants!: Table<LocalMerchant, string>;
  recurringRules!: Table<LocalRecurringRule, string>;
  goals!: Table<LocalGoal, string>;
  assets!: Table<LocalAsset, string>;
  liabilities!: Table<LocalLiability, string>;
  netWorthSnapshots!: Table<LocalNetWorthSnapshot, string>;
  tags!: Table<LocalTag, string>;

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
    // v3 adds the finance tables. Additive upgrade — existing object stores and
    // their data are preserved.
    this.version(3).stores({
      accounts: "id, type, archived, deleted, updatedAt, position",
      transactions:
        "id, accountId, transferAccountId, type, categoryId, merchantId, date, deleted, updatedAt",
    });
    // v4 adds merchants (additive upgrade).
    this.version(4).stores({
      merchants: "id, name, categoryId, deleted, updatedAt",
    });
    // v5 adds recurring rules / bills (additive upgrade).
    this.version(5).stores({
      recurringRules: "id, accountId, frequency, nextRun, deleted, updatedAt",
    });
    // v6 adds savings goals (additive upgrade).
    this.version(6).stores({
      goals: "id, kind, deleted, updatedAt",
    });
    // v7 adds net worth (assets, liabilities, snapshots) (additive upgrade).
    this.version(7).stores({
      assets: "id, kind, deleted, updatedAt",
      liabilities: "id, kind, deleted, updatedAt",
      netWorthSnapshots: "id, date, deleted, updatedAt",
    });
    // v8 adds category nesting (parentId index) plus color/icon. Existing rows
    // predate these fields, so backfill them to null on upgrade.
    this.version(8)
      .stores({
        categories: "id, kind, parentId, deleted, updatedAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table<LocalCategory>("categories")
          .toCollection()
          .modify((c) => {
            c.parentId ??= null;
            c.color ??= null;
            c.icon ??= null;
          });
      });
    // v9 adds transaction splits (splitParent/parentId indexes). Existing rows
    // are non-splits, so backfill splitParent=0 / parentId=null on upgrade.
    this.version(9)
      .stores({
        transactions:
          "id, accountId, transferAccountId, type, categoryId, merchantId, date, deleted, updatedAt, splitParent, parentId",
      })
      .upgrade(async (tx) => {
        await tx
          .table<LocalTransaction>("transactions")
          .toCollection()
          .modify((t) => {
            t.splitParent ??= 0;
            t.parentId ??= null;
          });
      });
    // v10 adds the tag registry (name + colour), additive.
    this.version(10).stores({
      tags: "id, name, deleted, updatedAt",
    });
  }
}

export const db = new SaldoDB();
