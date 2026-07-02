/**
 * Reactive net-worth reads and on-device aggregation. Net worth is derived from
 * account balances + manual assets − liabilities, mirroring the backend's
 * `compute_net_worth`, using the shared framework-free core so the numbers match.
 */

import { useLiveQuery } from "dexie-react-hooks";

import { db, type LocalAsset, type LocalLiability, type LocalNetWorthSnapshot } from "../../db/db";
import { allocation, growth, netWorth } from "../../shared/domain/networth";
import { useAccountBalances } from "../accounts/hooks";

export function useAssets(): LocalAsset[] {
  return (
    useLiveQuery(async () => {
      const all = await db.assets.where("deleted").equals(0).toArray();
      return all.sort((a, b) => a.name.localeCompare(b.name));
    }, []) ?? []
  );
}

export function useLiabilities(): LocalLiability[] {
  return (
    useLiveQuery(async () => {
      const all = await db.liabilities.where("deleted").equals(0).toArray();
      return all.sort((a, b) => a.name.localeCompare(b.name));
    }, []) ?? []
  );
}

export function useSnapshots(): LocalNetWorthSnapshot[] {
  return (
    useLiveQuery(async () => {
      const all = await db.netWorthSnapshots.where("deleted").equals(0).toArray();
      return all.sort((a, b) => a.date.localeCompare(b.date));
    }, []) ?? []
  );
}

export interface NetWorthSummary {
  assetsTotal: number;
  liabilitiesTotal: number;
  netWorth: number;
  allocation: Record<string, number>;
  growth: number | null;
}

export function useNetWorth(): NetWorthSummary {
  const balances = useAccountBalances(true);
  const assets = useAssets();
  const liabilities = useLiabilities();
  const snapshots = useSnapshots();

  const buckets: Record<string, number> = {};
  let assetsTotal = 0;
  let liabilitiesTotal = 0;

  for (const { account, balance } of balances) {
    if (balance >= 0) {
      assetsTotal += balance;
      buckets[account.type] = (buckets[account.type] ?? 0) + balance;
    } else {
      liabilitiesTotal += -balance;
    }
  }
  for (const asset of assets) {
    assetsTotal += asset.value;
    buckets[asset.kind] = (buckets[asset.kind] ?? 0) + asset.value;
  }
  for (const liability of liabilities) {
    liabilitiesTotal += liability.balance;
  }

  const total = netWorth(assetsTotal, liabilitiesTotal);
  const today = new Date().toISOString().slice(0, 10);
  const prior = [...snapshots].reverse().find((s) => s.date < today);

  return {
    assetsTotal,
    liabilitiesTotal,
    netWorth: total,
    allocation: allocation(buckets),
    growth: prior ? growth(total, prior.netWorth) : null,
  };
}
