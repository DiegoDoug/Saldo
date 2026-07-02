/**
 * Reactive recurring-rule reads plus an on-device "upcoming bills" projection
 * (mirrors the backend's /bills/upcoming), computed from the rules without
 * persisting anything.
 */

import { useLiveQuery } from "dexie-react-hooks";

import { db, type LocalRecurringRule } from "../../db/db";
import { occurrenceId, occurrencesBetween } from "../../shared/domain/recurring";

export function useRecurringRules(): LocalRecurringRule[] {
  return (
    useLiveQuery(async () => {
      const all = await db.recurringRules.where("deleted").equals(0).toArray();
      return all.sort((a, b) => a.nextRun.localeCompare(b.nextRun));
    }, []) ?? []
  );
}

export interface UpcomingBill {
  ruleId: string;
  occurrenceId: string;
  name: string;
  type: LocalRecurringRule["type"];
  amount: number;
  currency: string;
  date: string;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function projectUpcoming(rules: LocalRecurringRule[], days: number, today: string): UpcomingBill[] {
  const end = addDaysIso(today, days);
  const bills: UpcomingBill[] = [];
  for (const rule of rules) {
    const dates = occurrencesBetween(rule.nextRun, rule.frequency, rule.interval, today, end, rule.endDate);
    for (const date of dates) {
      bills.push({
        ruleId: rule.id,
        occurrenceId: occurrenceId(rule.id, date),
        name: rule.name,
        type: rule.type,
        amount: rule.amount,
        currency: rule.currency,
        date,
      });
    }
  }
  return bills.sort((a, b) => a.date.localeCompare(b.date));
}

export function useUpcomingBills(days = 30): UpcomingBill[] {
  const rules = useRecurringRules();
  const today = new Date().toISOString().slice(0, 10);
  return projectUpcoming(rules, days, today);
}
