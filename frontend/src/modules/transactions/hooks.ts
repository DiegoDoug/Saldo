/**
 * Reactive transaction reads from Dexie with client-side filtering, search and
 * sorting (offline-first: the local store is the source of truth). Mirrors the
 * backend's query parameters so a later server-paged mode is a drop-in.
 */

import { useLiveQuery } from "dexie-react-hooks";

import { db, type LocalTransaction } from "../../db/db";

export interface TransactionFilters {
  accountId?: string;
  type?: LocalTransaction["type"];
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  tag?: string;
  sort?: "date" | "amount";
  order?: "asc" | "desc";
}

function matches(t: LocalTransaction, f: TransactionFilters): boolean {
  if (t.deleted === 1) return false;
  if (f.accountId && t.accountId !== f.accountId && t.transferAccountId !== f.accountId) return false;
  if (f.type && t.type !== f.type) return false;
  if (f.categoryId && t.categoryId !== f.categoryId) return false;
  if (f.dateFrom && t.date < f.dateFrom) return false;
  if (f.dateTo && t.date > f.dateTo) return false;
  if (f.q && !t.notes.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.tag && !t.tags.includes(f.tag)) return false;
  return true;
}

function sortTransactions(rows: LocalTransaction[], f: TransactionFilters): LocalTransaction[] {
  const key = f.sort ?? "date";
  const dir = (f.order ?? "desc") === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp = key === "amount" ? a.amount - b.amount : a.date.localeCompare(b.date);
    // Stable tiebreaker on id so ordering is deterministic across equal keys.
    return cmp !== 0 ? cmp * dir : a.id.localeCompare(b.id);
  });
}

export function useTransactions(filters: TransactionFilters = {}): LocalTransaction[] {
  const key = JSON.stringify(filters);
  return (
    useLiveQuery(async () => {
      const all = await db.transactions.where("deleted").equals(0).toArray();
      return sortTransactions(all.filter((t) => matches(t, filters)), filters);
    }, [key]) ?? []
  );
}

export function useTransaction(id: string | undefined): LocalTransaction | undefined {
  return useLiveQuery(async () => (id ? db.transactions.get(id) : undefined), [id]);
}
