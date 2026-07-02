/**
 * Dexie-first goal operations. Every mutation writes here immediately
 * (offline-safe); the sync engine propagates to the backend in the background.
 */

import { db, type GoalKind, type LocalGoal } from "../../db/db";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

export interface NewGoal {
  name: string;
  kind: GoalKind;
  targetAmount: number;
  currentAmount?: number;
  monthlyContribution?: number;
  currency?: string;
  targetDate?: string | null;
}

export async function addGoal(input: NewGoal): Promise<string> {
  const id = newId();
  await db.goals.put({
    id,
    name: input.name,
    kind: input.kind,
    targetAmount: input.targetAmount,
    currentAmount: input.currentAmount ?? 0,
    monthlyContribution: input.monthlyContribution ?? 0,
    currency: (input.currency ?? "EUR").toUpperCase(),
    targetDate: input.targetDate ?? null,
    updatedAt: nowIso(),
    deleted: 0,
  });
  return id;
}

export async function updateGoal(
  id: string,
  patch: Partial<
    Pick<
      LocalGoal,
      "name" | "kind" | "targetAmount" | "currentAmount" | "monthlyContribution" | "currency" | "targetDate"
    >
  >,
): Promise<void> {
  await db.goals.update(id, { ...patch, updatedAt: nowIso() });
}

/** Add (or subtract, with a negative amount) to a goal's saved balance. */
export async function contribute(id: string, amount: number): Promise<void> {
  const goal = await db.goals.get(id);
  if (!goal) return;
  await db.goals.update(id, {
    currentAmount: goal.currentAmount + amount,
    updatedAt: nowIso(),
  });
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.update(id, { deleted: 1, updatedAt: nowIso() });
}
