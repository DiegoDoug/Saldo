/**
 * Dexie-first transaction operations. Every mutation writes here immediately
 * (offline-safe, instant UI); the sync engine propagates to the backend in the
 * background. Deletions are tombstones (`deleted = 1`).
 */

import { db, type LocalTransaction, type TransactionType } from "../../db/db";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

const todayIso = () => new Date().toISOString().slice(0, 10);

export interface NewTransaction {
  type: TransactionType;
  amount: number;
  currency?: string;
  accountId: string;
  transferAccountId?: string | null;
  categoryId?: string | null;
  merchantId?: string | null;
  date?: string;
  notes?: string;
  tags?: string[];
}

export async function addTransaction(input: NewTransaction): Promise<string> {
  const id = newId();
  await db.transactions.put({
    id,
    type: input.type,
    amount: input.amount,
    currency: (input.currency ?? "EUR").toUpperCase(),
    accountId: input.accountId,
    transferAccountId: input.transferAccountId ?? null,
    merchantId: input.merchantId ?? null,
    recurringId: null,
    categoryId: input.categoryId ?? null,
    splitParent: 0,
    parentId: null,
    date: input.date ?? todayIso(),
    notes: input.notes ?? "",
    tags: input.tags ?? [],
    updatedAt: nowIso(),
    deleted: 0,
  });
  return id;
}

export interface SplitChild {
  categoryId?: string | null;
  amount: number;
  notes?: string;
}

export interface NewSplit {
  type: "income" | "expense";
  currency?: string;
  accountId: string;
  merchantId?: string | null;
  date?: string;
  notes?: string;
  tags?: string[];
  children: SplitChild[];
}

/** Cent-safe equality so float noise doesn't reject a valid split. */
function centsEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/** True when the split's line items sum (to the cent) to its total. */
export function splitChildrenSumTo(total: number, children: SplitChild[]): boolean {
  if (children.length === 0) return false;
  return centsEqual(
    children.reduce((s, c) => s + c.amount, 0),
    total,
  );
}

/**
 * Record a split as one parent container (excluded from money sums) plus its
 * categorized child leaves, in a single Dexie `rw` transaction so a split never
 * lands half-written. The children must sum to `total`. Returns the parent id.
 */
export async function addSplit(total: number, input: NewSplit): Promise<string> {
  if (input.children.length === 0) throw new Error("A split needs at least one line item");
  if (!splitChildrenSumTo(total, input.children)) {
    throw new Error("Split line items must sum to the total amount");
  }
  const parentId = newId();
  const ts = nowIso();
  const currency = (input.currency ?? "EUR").toUpperCase();
  const date = input.date ?? todayIso();
  await db.transaction("rw", db.transactions, async () => {
    await db.transactions.put({
      id: parentId,
      type: input.type,
      amount: total,
      currency,
      accountId: input.accountId,
      transferAccountId: null,
      merchantId: input.merchantId ?? null,
      recurringId: null,
      categoryId: null,
      splitParent: 1,
      parentId: null,
      date,
      notes: input.notes ?? "",
      tags: input.tags ?? [],
      updatedAt: ts,
      deleted: 0,
    });
    await db.transactions.bulkPut(
      input.children.map((c) => ({
        id: newId(),
        type: input.type,
        amount: c.amount,
        currency,
        accountId: input.accountId,
        transferAccountId: null,
        merchantId: null,
        recurringId: null,
        categoryId: c.categoryId ?? null,
        splitParent: 0 as const,
        parentId,
        date,
        notes: c.notes ?? "",
        tags: [],
        updatedAt: ts,
        deleted: 0 as const,
      })),
    );
  });
  return parentId;
}

/** Soft-delete a split parent together with all its children. */
export async function deleteSplit(parentId: string): Promise<void> {
  const ts = nowIso();
  const children = await db.transactions.where("parentId").equals(parentId).toArray();
  await Promise.all(
    [parentId, ...children.map((c) => c.id)].map((id) =>
      db.transactions.update(id, { deleted: 1, updatedAt: ts }),
    ),
  );
}

/** Record a transfer as one row carrying both legs (from → to). */
export async function addTransfer(input: {
  amount: number;
  currency?: string;
  fromAccountId: string;
  toAccountId: string;
  date?: string;
  notes?: string;
}): Promise<string> {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error("A transfer needs two distinct accounts");
  }
  return addTransaction({
    type: "transfer",
    amount: input.amount,
    currency: input.currency,
    accountId: input.fromAccountId,
    transferAccountId: input.toAccountId,
    date: input.date,
    notes: input.notes,
  });
}

export async function updateTransaction(
  id: string,
  patch: Partial<
    Pick<
      LocalTransaction,
      "amount" | "currency" | "accountId" | "categoryId" | "merchantId" | "date" | "notes" | "tags" | "type"
    >
  >,
): Promise<void> {
  await db.transactions.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.update(id, { deleted: 1, updatedAt: nowIso() });
}

/** Bulk soft-delete. */
export async function bulkDelete(ids: string[]): Promise<void> {
  const ts = nowIso();
  await Promise.all(ids.map((id) => db.transactions.update(id, { deleted: 1, updatedAt: ts })));
}

/** Bulk set category. */
export async function bulkSetCategory(ids: string[], categoryId: string | null): Promise<void> {
  const ts = nowIso();
  await Promise.all(ids.map((id) => db.transactions.update(id, { categoryId, updatedAt: ts })));
}
