/**
 * Mapping between the backend's snake_case recurring-rule wire shape and the
 * local Dexie camelCase row.
 */

import type { Frequency, LocalRecurringRule, TransactionType } from "../../db/db";

export interface WireRecurringRule {
  id: string;
  name: string;
  type: TransactionType;
  amount: number;
  currency: string;
  account_id: string;
  transfer_account_id: string | null;
  merchant_id: string | null;
  category_id: string | null;
  notes: string;
  frequency: Frequency;
  interval: number;
  start_date: string;
  end_date: string | null;
  next_run: string;
  auto_generate: boolean;
  updated_at: string;
  deleted: boolean;
}

export function wireToLocalRule(w: WireRecurringRule): LocalRecurringRule {
  return {
    id: w.id,
    name: w.name,
    type: w.type,
    amount: w.amount,
    currency: w.currency,
    accountId: w.account_id,
    transferAccountId: w.transfer_account_id,
    merchantId: w.merchant_id,
    categoryId: w.category_id,
    notes: w.notes,
    frequency: w.frequency,
    interval: w.interval,
    startDate: w.start_date,
    endDate: w.end_date,
    nextRun: w.next_run,
    autoGenerate: w.auto_generate ? 1 : 0,
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function localRuleToSync(r: LocalRecurringRule) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    amount: r.amount,
    currency: r.currency,
    account_id: r.accountId,
    transfer_account_id: r.transferAccountId,
    merchant_id: r.merchantId,
    category_id: r.categoryId,
    notes: r.notes,
    frequency: r.frequency,
    interval: r.interval,
    start_date: r.startDate,
    end_date: r.endDate,
    next_run: r.nextRun,
    auto_generate: r.autoGenerate === 1,
    updated_at: r.updatedAt,
    deleted: r.deleted === 1,
  };
}
