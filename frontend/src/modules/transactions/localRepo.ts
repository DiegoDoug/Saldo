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
    date: input.date ?? todayIso(),
    notes: input.notes ?? "",
    tags: input.tags ?? [],
    updatedAt: nowIso(),
    deleted: 0,
  });
  return id;
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
