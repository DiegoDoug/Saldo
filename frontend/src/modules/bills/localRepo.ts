/**
 * Dexie-first recurring-rule operations, including client-side materialization.
 *
 * Materialization mirrors the backend (`bills/service.py`): it creates a
 * transaction per occurrence using the SAME deterministic id
 * (`occurrenceId(ruleId, date)`), so a bill generated here and on the server (or
 * another device) collapses to one transaction under last-write-wins sync — no
 * duplicates. Advancing `nextRun` past the last occurrence keeps it idempotent.
 */

import { db, type Frequency, type LocalRecurringRule, type TransactionType } from "../../db/db";
import { advance, occurrenceId, occurrencesBetween } from "../../shared/domain/recurring";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const todayIso = () => new Date().toISOString().slice(0, 10);

export interface NewRule {
  name: string;
  type: TransactionType;
  amount: number;
  currency?: string;
  accountId: string;
  transferAccountId?: string | null;
  merchantId?: string | null;
  categoryId?: string | null;
  notes?: string;
  frequency: Frequency;
  interval?: number;
  startDate: string;
  endDate?: string | null;
}

export async function addRule(input: NewRule): Promise<string> {
  const id = newId();
  await db.recurringRules.put({
    id,
    name: input.name,
    type: input.type,
    amount: input.amount,
    currency: (input.currency ?? "EUR").toUpperCase(),
    accountId: input.accountId,
    transferAccountId: input.transferAccountId ?? null,
    merchantId: input.merchantId ?? null,
    categoryId: input.categoryId ?? null,
    notes: input.notes ?? "",
    frequency: input.frequency,
    interval: Math.max(1, input.interval ?? 1),
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    nextRun: input.startDate,
    autoGenerate: 1,
    updatedAt: nowIso(),
    deleted: 0,
  });
  return id;
}

export async function updateRule(
  id: string,
  patch: Partial<Pick<LocalRecurringRule, "name" | "amount" | "notes" | "endDate" | "autoGenerate">>,
): Promise<void> {
  await db.recurringRules.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteRule(id: string): Promise<void> {
  await db.recurringRules.update(id, { deleted: 1, updatedAt: nowIso() });
}

/**
 * Materialize a rule's due occurrences up to `until` (default today). Writes one
 * transaction per occurrence (deterministic id) and advances `nextRun`. Returns
 * the count created.
 */
export async function materializeRule(rule: LocalRecurringRule, until = todayIso()): Promise<number> {
  const dates = occurrencesBetween(
    rule.nextRun,
    rule.frequency,
    rule.interval,
    rule.nextRun,
    until,
    rule.endDate,
  );
  if (dates.length === 0) return 0;

  const ts = nowIso();
  let created = 0;
  for (const date of dates) {
    const txId = occurrenceId(rule.id, date);
    if (await db.transactions.get(txId)) continue; // already materialized
    await db.transactions.put({
      id: txId,
      type: rule.type,
      amount: rule.amount,
      currency: rule.currency,
      accountId: rule.accountId,
      transferAccountId: rule.transferAccountId,
      merchantId: rule.merchantId,
      recurringId: rule.id,
      categoryId: rule.categoryId,
      date,
      notes: rule.notes,
      tags: [],
      updatedAt: ts,
      deleted: 0,
    });
    created += 1;
  }

  // Advance the cursor past the last materialized occurrence.
  const advanced = advance(dates[dates.length - 1], rule.frequency, rule.interval);
  await db.recurringRules.update(rule.id, { nextRun: advanced, updatedAt: ts });
  return created;
}
