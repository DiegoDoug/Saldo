/**
 * Mapping between the backend's snake_case transaction wire shape and the local
 * Dexie camelCase row.
 */

import type { LocalTransaction, TransactionType } from "../../db/db";

export interface WireTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  account_id: string;
  transfer_account_id: string | null;
  merchant_id: string | null;
  recurring_id: string | null;
  category_id: string | null;
  date: string;
  notes: string;
  tags: string[];
  updated_at: string;
  deleted: boolean;
}

export function wireToLocalTransaction(w: WireTransaction): LocalTransaction {
  return {
    id: w.id,
    type: w.type,
    amount: w.amount,
    currency: w.currency,
    accountId: w.account_id,
    transferAccountId: w.transfer_account_id,
    merchantId: w.merchant_id,
    recurringId: w.recurring_id,
    categoryId: w.category_id,
    date: w.date,
    notes: w.notes,
    tags: w.tags ?? [],
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function localTransactionToSync(t: LocalTransaction) {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    currency: t.currency,
    account_id: t.accountId,
    transfer_account_id: t.transferAccountId,
    merchant_id: t.merchantId,
    recurring_id: t.recurringId,
    category_id: t.categoryId,
    date: t.date,
    notes: t.notes,
    tags: t.tags,
    updated_at: t.updatedAt,
    deleted: t.deleted === 1,
  };
}
