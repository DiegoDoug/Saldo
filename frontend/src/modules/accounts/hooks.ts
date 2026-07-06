/**
 * Reactive account reads from Dexie. Balances are derived on-device from the
 * local transaction ledger (mirroring the backend's `account_deltas`) so they
 * stay correct offline and update live as transactions change.
 */

import { useLiveQuery } from "dexie-react-hooks";

import { db, type LocalAccount, type LocalTransaction } from "../../db/db";

export function useAccounts(includeArchived = false): LocalAccount[] {
  return (
    useLiveQuery(async () => {
      const all = await db.accounts.where("deleted").equals(0).toArray();
      const visible = includeArchived ? all : all.filter((a) => a.archived === 0);
      return visible.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    }, [includeArchived]) ?? []
  );
}

export function useAccount(id: string | undefined): LocalAccount | undefined {
  return useLiveQuery(async () => (id ? db.accounts.get(id) : undefined), [id]);
}

/** Signed transaction sum per account id (income +, expense -, transfer both). */
export function accountDeltas(transactions: LocalTransaction[]): Map<string, number> {
  const deltas = new Map<string, number>();
  const add = (id: string, amount: number) => deltas.set(id, (deltas.get(id) ?? 0) + amount);
  for (const t of transactions) {
    if (t.deleted === 1) continue;
    // Split parents are containers; their children carry the real movement.
    if (t.splitParent === 1) continue;
    if (t.type === "income") add(t.accountId, t.amount);
    else if (t.type === "expense") add(t.accountId, -t.amount);
    else if (t.type === "transfer") {
      add(t.accountId, -t.amount);
      if (t.transferAccountId) add(t.transferAccountId, t.amount);
    }
  }
  return deltas;
}

export interface AccountBalance {
  account: LocalAccount;
  balance: number;
}

export function useAccountBalances(includeArchived = false): AccountBalance[] {
  const accounts = useAccounts(includeArchived);
  const transactions =
    useLiveQuery(() => db.transactions.where("deleted").equals(0).toArray(), []) ?? [];
  const deltas = accountDeltas(transactions);
  return accounts.map((account) => ({
    account,
    balance: account.openingBalance + (deltas.get(account.id) ?? 0),
  }));
}

/** Total balance per currency across all (optionally archived) accounts. */
export function useTotalsByCurrency(includeArchived = false): Record<string, number> {
  const balances = useAccountBalances(includeArchived);
  const totals: Record<string, number> = {};
  for (const { account, balance } of balances) {
    totals[account.currency] = (totals[account.currency] ?? 0) + balance;
  }
  return totals;
}
