/**
 * Pure, framework-free analytics over transactions — the TS mirror of
 * `backend/app/shared/domain/reports.py`. Both cores must agree on the same
 * numbers (the mirrored tests assert identical values on a fixed dataset).
 *
 * Transfers are internal moves and are excluded from income/expense analytics.
 */

export interface ReportTx {
  type: "income" | "expense" | "transfer";
  amount: number;
  date: string; // YYYY-MM-DD
  categoryId?: string | null;
  merchantId?: string | null;
}

export interface MonthPoint {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  net: number;
}

export interface KeyTotal {
  key: string;
  total: number;
}

export interface Report {
  byMonth: MonthPoint[];
  spendingByCategory: KeyTotal[];
  spendingByMerchant: KeyTotal[];
  largestExpenses: ReportTx[];
  incomeTotal: number;
  expenseTotal: number;
  net: number;
  savingsRate: number;
  healthScore: number;
}

export function savingsRate(incomeTotal: number, expenseTotal: number): number {
  if (incomeTotal <= 0) return 0;
  return (incomeTotal - expenseTotal) / incomeTotal;
}

/** Financial-health score in [0, 100] from the savings rate (30%+ = full). */
export function healthScore(rate: number): number {
  const scaled = Math.round((rate / 0.3) * 100);
  return Math.max(0, Math.min(100, scaled));
}

function sortedTotals(totals: Map<string, number>): KeyTotal[] {
  return [...totals.entries()]
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export function buildReport(txs: ReportTx[], largestN = 5): Report {
  const months = new Map<string, MonthPoint>();
  const byCategory = new Map<string, number>();
  const byMerchant = new Map<string, number>();
  let incomeTotal = 0;
  let expenseTotal = 0;
  const expenses: ReportTx[] = [];

  for (const tx of txs) {
    if (tx.type === "transfer") continue;
    const month = tx.date.slice(0, 7);
    const point = months.get(month) ?? { month, income: 0, expense: 0, net: 0 };
    if (tx.type === "income") {
      incomeTotal += tx.amount;
      point.income += tx.amount;
    } else {
      expenseTotal += tx.amount;
      point.expense += tx.amount;
      expenses.push(tx);
      if (tx.categoryId) byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + tx.amount);
      if (tx.merchantId) byMerchant.set(tx.merchantId, (byMerchant.get(tx.merchantId) ?? 0) + tx.amount);
    }
    point.net = point.income - point.expense;
    months.set(month, point);
  }

  const rate = savingsRate(incomeTotal, expenseTotal);
  return {
    byMonth: [...months.keys()].sort().map((m) => months.get(m)!),
    spendingByCategory: sortedTotals(byCategory),
    spendingByMerchant: sortedTotals(byMerchant),
    largestExpenses: [...expenses]
      .sort((a, b) => b.amount - a.amount || a.date.localeCompare(b.date))
      .slice(0, largestN),
    incomeTotal,
    expenseTotal,
    net: incomeTotal - expenseTotal,
    savingsRate: rate,
    healthScore: healthScore(rate),
  };
}
