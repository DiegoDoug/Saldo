/**
 * Dexie-first account operations. Every mutation writes here immediately (so the
 * UI is offline-safe and instant); the sync engine propagates to the backend in
 * the background. Nothing here touches the network.
 */

import { type AccountType, db, type LocalAccount } from "../../db/db";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

export interface NewAccount {
  name: string;
  type: AccountType;
  currency?: string;
  openingBalance?: number;
  color?: string;
  icon?: string;
}

export async function addAccount(input: NewAccount): Promise<string> {
  const all = await db.accounts.toArray();
  const position = all.reduce((max, a) => Math.max(max, a.position), -1) + 1;
  const id = newId();
  await db.accounts.put({
    id,
    name: input.name,
    type: input.type,
    currency: (input.currency ?? "EUR").toUpperCase(),
    openingBalance: input.openingBalance ?? 0,
    color: input.color ?? "",
    icon: input.icon ?? "",
    position,
    archived: 0,
    updatedAt: nowIso(),
    deleted: 0,
  });
  return id;
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<LocalAccount, "name" | "type" | "currency" | "openingBalance" | "color" | "icon" | "archived">>,
): Promise<void> {
  await db.accounts.update(id, { ...patch, updatedAt: nowIso() });
}

export async function archiveAccount(id: string, archived: boolean): Promise<void> {
  await db.accounts.update(id, { archived: archived ? 1 : 0, updatedAt: nowIso() });
}

export async function deleteAccount(id: string): Promise<void> {
  const ts = nowIso();
  await db.accounts.update(id, { deleted: 1, updatedAt: ts });
  // Tombstone the account's transactions too, so their amounts stop counting
  // toward any balance (matches the backend's user-scoped soft-delete pattern).
  const owned = await db.transactions
    .filter((t) => t.accountId === id || t.transferAccountId === id)
    .toArray();
  await Promise.all(owned.map((t) => db.transactions.update(t.id, { deleted: 1, updatedAt: ts })));
}
