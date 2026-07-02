/**
 * Reactive analytics computed on-device from the local transaction ledger via
 * the shared framework-free reports core (so the numbers match the backend).
 */

import { useLiveQuery } from "dexie-react-hooks";

import { db } from "../../db/db";
import { buildReport, type Report } from "../../shared/domain/reports";

export function useReport(dateFrom?: string, dateTo?: string): Report {
  const txs =
    useLiveQuery(async () => {
      const all = await db.transactions.where("deleted").equals(0).toArray();
      return all
        .filter((t) => (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo))
        .map((t) => ({
          type: t.type,
          amount: t.amount,
          date: t.date,
          categoryId: t.categoryId,
          merchantId: t.merchantId,
        }));
    }, [dateFrom, dateTo]) ?? [];
  return buildReport(txs);
}
