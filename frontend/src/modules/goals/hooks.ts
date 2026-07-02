/**
 * Reactive goal reads plus on-device projections (progress, months remaining,
 * estimated completion date), computed by the shared framework-free core so the
 * figures match the backend exactly.
 */

import { useLiveQuery } from "dexie-react-hooks";

import { db, type LocalGoal } from "../../db/db";
import { completionDate, monthsRemaining, progress, remainingAmount } from "../../shared/domain/goals";

export function useGoals(): LocalGoal[] {
  return (
    useLiveQuery(async () => {
      const all = await db.goals.where("deleted").equals(0).toArray();
      return all.sort((a, b) => a.name.localeCompare(b.name));
    }, []) ?? []
  );
}

export interface GoalProjection {
  progress: number;
  remaining: number;
  monthsRemaining: number | null;
  completionDate: string | null;
}

export function projectGoal(goal: LocalGoal, today: string): GoalProjection {
  return {
    progress: progress(goal.currentAmount, goal.targetAmount),
    remaining: remainingAmount(goal.currentAmount, goal.targetAmount),
    monthsRemaining: monthsRemaining(goal.currentAmount, goal.targetAmount, goal.monthlyContribution),
    completionDate: completionDate(
      today,
      goal.currentAmount,
      goal.targetAmount,
      goal.monthlyContribution,
    ),
  };
}

export function useGoalProjection(goal: LocalGoal): GoalProjection {
  const today = new Date().toISOString().slice(0, 10);
  return projectGoal(goal, today);
}
