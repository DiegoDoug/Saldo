/**
 * Mapping between the backend's snake_case goal wire shape and the local Dexie
 * camelCase row.
 */

import type { GoalKind, LocalGoal } from "../../db/db";

export interface WireGoal {
  id: string;
  name: string;
  kind: GoalKind;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
  currency: string;
  target_date: string | null;
  updated_at: string;
  deleted: boolean;
}

export function wireToLocalGoal(w: WireGoal): LocalGoal {
  return {
    id: w.id,
    name: w.name,
    kind: w.kind,
    targetAmount: w.target_amount,
    currentAmount: w.current_amount,
    monthlyContribution: w.monthly_contribution,
    currency: w.currency,
    targetDate: w.target_date,
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function localGoalToSync(g: LocalGoal) {
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    target_amount: g.targetAmount,
    current_amount: g.currentAmount,
    monthly_contribution: g.monthlyContribution,
    currency: g.currency,
    target_date: g.targetDate,
    updated_at: g.updatedAt,
    deleted: g.deleted === 1,
  };
}
