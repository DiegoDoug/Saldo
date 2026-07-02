/**
 * Dexie-first net-worth operations (assets, liabilities, snapshots). Every
 * mutation writes here immediately (offline-safe); the sync engine propagates in
 * the background. Deletions are tombstones.
 */

import {
  type AssetKind,
  db,
  type LiabilityKind,
  type LocalAsset,
  type LocalLiability,
} from "../../db/db";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const todayIso = () => new Date().toISOString().slice(0, 10);

export async function addAsset(input: {
  name: string;
  kind: AssetKind;
  value: number;
  currency?: string;
}): Promise<string> {
  const id = newId();
  await db.assets.put({
    id,
    name: input.name,
    kind: input.kind,
    value: input.value,
    currency: (input.currency ?? "EUR").toUpperCase(),
    updatedAt: nowIso(),
    deleted: 0,
  });
  return id;
}

export async function updateAsset(
  id: string,
  patch: Partial<Pick<LocalAsset, "name" | "kind" | "value" | "currency">>,
): Promise<void> {
  await db.assets.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteAsset(id: string): Promise<void> {
  await db.assets.update(id, { deleted: 1, updatedAt: nowIso() });
}

export async function addLiability(input: {
  name: string;
  kind: LiabilityKind;
  balance: number;
  currency?: string;
  interestRate?: number;
}): Promise<string> {
  const id = newId();
  await db.liabilities.put({
    id,
    name: input.name,
    kind: input.kind,
    balance: input.balance,
    currency: (input.currency ?? "EUR").toUpperCase(),
    interestRate: input.interestRate ?? 0,
    updatedAt: nowIso(),
    deleted: 0,
  });
  return id;
}

export async function updateLiability(
  id: string,
  patch: Partial<Pick<LocalLiability, "name" | "kind" | "balance" | "currency" | "interestRate">>,
): Promise<void> {
  await db.liabilities.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteLiability(id: string): Promise<void> {
  await db.liabilities.update(id, { deleted: 1, updatedAt: nowIso() });
}

/**
 * Record (or refresh) today's net-worth snapshot — one row per day, so the
 * history chart gains a point per day the app is opened. Mirrors the backend's
 * upsert-by-date.
 */
export async function recordSnapshot(
  assetsTotal: number,
  liabilitiesTotal: number,
  netWorth: number,
  currency: string,
): Promise<void> {
  const date = todayIso();
  const existing = await db.netWorthSnapshots
    .filter((s) => s.deleted === 0 && s.date === date)
    .first();
  const id = existing?.id ?? newId();
  await db.netWorthSnapshots.put({
    id,
    date,
    assetsTotal,
    liabilitiesTotal,
    netWorth,
    currency,
    updatedAt: nowIso(),
    deleted: 0,
  });
}
