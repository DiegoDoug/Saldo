/**
 * On-device cash-flow forecast. Assembles the same three inputs as the backend
 * (start balance, scheduled recurring events, trailing discretionary spend) from
 * local Dexie data and runs the shared forecast core, so the offline projection
 * matches the API.
 */

import { useLiveQuery } from "dexie-react-hooks";

import { db } from "../../db/db";
import { forecast, type ForecastResult } from "../../shared/domain/forecast";
import { occurrencesBetween } from "../../shared/domain/recurring";
import { useAccountBalances } from "../accounts/hooks";

const HISTORY_WINDOW_DAYS = 90;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function useForecast(days: number): ForecastResult {
  const balances = useAccountBalances(true);
  const startBalance = balances.reduce((sum, b) => sum + b.balance, 0);

  const rules = useLiveQuery(() => db.recurringRules.where("deleted").equals(0).toArray(), []) ?? [];
  const today = todayIso();
  const end = addDaysIso(today, days);

  const scheduled: Record<string, number> = {};
  for (const rule of rules) {
    if (rule.type === "transfer") continue;
    const sign = rule.type === "income" ? 1 : -1;
    const dates = occurrencesBetween(rule.nextRun, rule.frequency, rule.interval, today, end, rule.endDate);
    for (const date of dates) scheduled[date] = (scheduled[date] ?? 0) + sign * rule.amount;
  }

  // Trailing discretionary spend: non-recurring expenses in the last 90 days.
  const windowStart = addDaysIso(today, -HISTORY_WINDOW_DAYS);
  const history =
    useLiveQuery(async () => {
      const all = await db.transactions.where("deleted").equals(0).toArray();
      return all.filter(
        (t) => t.type === "expense" && !t.recurringId && t.date >= windowStart && t.date <= today,
      );
    }, [windowStart, today]) ?? [];
  const discretionary = history.reduce((sum, t) => sum + t.amount, 0);
  const avgDailyNet = -(discretionary / HISTORY_WINDOW_DAYS);

  return forecast(startBalance, today, days, scheduled, avgDailyNet);
}
