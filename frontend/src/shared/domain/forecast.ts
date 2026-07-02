/**
 * Pure, framework-free cash-flow forecasting — the TS mirror of
 * `backend/app/shared/domain/forecast.py`. Both cores must agree on the same
 * balances (the mirrored tests assert identical values).
 *
 * Dates are ISO `YYYY-MM-DD` strings (never `Date` objects) to avoid timezone
 * drift.
 */

export interface ForecastPoint {
  date: string;
  balance: number;
}

export interface ForecastResult {
  points: ForecastPoint[];
  endBalance: number;
  minBalance: number;
  minDate: string;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function forecast(
  startBalance: number,
  startDate: string,
  days: number,
  scheduled: Record<string, number>,
  avgDailyNet: number,
): ForecastResult {
  const points: ForecastPoint[] = [{ date: startDate, balance: startBalance }];
  let balance = startBalance;
  for (let i = 1; i <= days; i += 1) {
    const date = addDays(startDate, i);
    balance += avgDailyNet + (scheduled[date] ?? 0);
    points.push({ date, balance });
  }

  let minPoint = points[0];
  for (const point of points) {
    if (point.balance < minPoint.balance) minPoint = point;
  }

  return {
    points,
    endBalance: points[points.length - 1].balance,
    minBalance: minPoint.balance,
    minDate: minPoint.date,
  };
}
