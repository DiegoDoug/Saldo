/**
 * Reactive merchant reads from Dexie, plus on-device spend stats derived from
 * the local transaction ledger (mirroring the backend's /merchants/{id}/stats).
 */

import { useLiveQuery } from "dexie-react-hooks";

import { db, type LocalMerchant, type LocalTransaction } from "../../db/db";

export function useMerchants(): LocalMerchant[] {
  return (
    useLiveQuery(async () => {
      const all = await db.merchants.where("deleted").equals(0).toArray();
      return all.sort((a, b) => a.name.localeCompare(b.name));
    }, []) ?? []
  );
}

export function useMerchant(id: string | undefined): LocalMerchant | undefined {
  return useLiveQuery(async () => (id ? db.merchants.get(id) : undefined), [id]);
}

export interface MerchantStats {
  transactionCount: number;
  totalSpent: number;
  totalReceived: number;
}

export function merchantStats(
  merchantId: string,
  transactions: LocalTransaction[],
): MerchantStats {
  const owned = transactions.filter((t) => t.deleted === 0 && t.merchantId === merchantId);
  return {
    transactionCount: owned.length,
    totalSpent: owned.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    totalReceived: owned.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
  };
}

/** Live stats map keyed by merchant id. */
export function useMerchantStats(): Map<string, MerchantStats> {
  const merchants = useMerchants();
  const transactions =
    useLiveQuery(() => db.transactions.where("deleted").equals(0).toArray(), []) ?? [];
  return new Map(merchants.map((m) => [m.id, merchantStats(m.id, transactions)]));
}
