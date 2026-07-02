/**
 * Dexie-first merchant operations. Every mutation writes here immediately
 * (offline-safe); the sync engine propagates to the backend in the background.
 */

import { db, type LocalMerchant } from "../../db/db";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

export interface NewMerchant {
  name: string;
  color?: string;
  categoryId?: string | null;
  website?: string;
  location?: string;
  recurringProbability?: number;
}

export async function addMerchant(input: NewMerchant): Promise<string> {
  const id = newId();
  await db.merchants.put({
    id,
    name: input.name,
    logo: "",
    color: input.color ?? "",
    categoryId: input.categoryId ?? null,
    website: input.website ?? "",
    location: input.location ?? "",
    recurringProbability: clampProbability(input.recurringProbability ?? 0),
    updatedAt: nowIso(),
    deleted: 0,
  });
  return id;
}

export async function updateMerchant(
  id: string,
  patch: Partial<
    Pick<
      LocalMerchant,
      "name" | "color" | "categoryId" | "website" | "location" | "recurringProbability"
    >
  >,
): Promise<void> {
  const next = { ...patch, updatedAt: nowIso() };
  if (next.recurringProbability !== undefined) {
    next.recurringProbability = clampProbability(next.recurringProbability);
  }
  await db.merchants.update(id, next);
}

export async function deleteMerchant(id: string): Promise<void> {
  const ts = nowIso();
  await db.merchants.update(id, { deleted: 1, updatedAt: ts });
  // Detach the merchant from its transactions so they don't reference a
  // tombstoned merchant (the transaction rows themselves are kept).
  const linked = await db.transactions.filter((t) => t.merchantId === id).toArray();
  await Promise.all(
    linked.map((t) => db.transactions.update(t.id, { merchantId: null, updatedAt: ts })),
  );
}

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}
