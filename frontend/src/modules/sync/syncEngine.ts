/**
 * Reconcile the local Dexie store with the backend.
 *
 * Flow: push everything changed since the last sync, merge the server's resolved
 * versions back (the server may have won a conflict), pull everything the server
 * changed since last time, merge that in, then remember the server's clock as
 * the new watermark. Conflict resolution is last-write-wins on `updatedAt`,
 * matching the backend.
 *
 * Timestamps are compared as epoch milliseconds, not strings: the backend emits
 * naive-UTC ISO (no "Z") while the client writes `toISOString()` (with "Z"), so
 * `toEpoch` normalizes a missing timezone to UTC before comparing.
 */

import { ApiError } from "../../shared/api/client";
import { db, type LocalCategory, type LocalEntry } from "../../db/db";
import {
  localCategoryToSync,
  localEntryToSync,
  wireToLocalCategory,
  wireToLocalEntry,
  type WireCategory,
  type WireEntry,
} from "../budgeting/mappers";
import { seedDefaultCategoriesIfEmpty } from "../budgeting/localRepo";
import { pullSync, pushSync } from "./api";

const LAST_SYNC_KEY = "lastSyncAt";

export function toEpoch(iso: string): number {
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  return Date.parse(hasZone ? iso : `${iso}Z`);
}

async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}

async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

async function mergeCategories(incoming: WireCategory[]): Promise<void> {
  for (const wc of incoming) {
    const local = await db.categories.get(wc.id);
    const next = wireToLocalCategory(wc);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.categories.put(next);
    }
  }
}

async function mergeEntries(incoming: WireEntry[]): Promise<void> {
  for (const we of incoming) {
    const local = await db.entries.get(we.id);
    const next = wireToLocalEntry(we);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.entries.put(next);
    }
  }
}

function changedSince<T extends LocalCategory | LocalEntry>(rows: T[], since?: string): T[] {
  if (!since) return rows;
  const cutoff = toEpoch(since);
  return rows.filter((r) => toEpoch(r.updatedAt) > cutoff);
}

let running = false;

/**
 * Run one sync pass. Returns true if it completed, false if it was skipped
 * (offline, unauthenticated, or already running). Never throws for expected
 * offline/auth conditions — background sync must not crash the UI.
 */
export async function runSync(): Promise<boolean> {
  if (running) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  running = true;
  try {
    const since = await getMeta(LAST_SYNC_KEY);

    const allCategories = await db.categories.toArray();
    const allEntries = await db.entries.toArray();
    const dirtyCategories = changedSince(allCategories, since).map(localCategoryToSync);
    const dirtyEntries = changedSince(allEntries, since).map(localEntryToSync);

    if (dirtyCategories.length || dirtyEntries.length) {
      const pushed = await pushSync(dirtyCategories, dirtyEntries);
      await mergeCategories(pushed.categories);
      await mergeEntries(pushed.entries);
    }

    const pulled = await pullSync(since);
    await mergeCategories(pulled.categories);
    await mergeEntries(pulled.entries);
    await setMeta(LAST_SYNC_KEY, pulled.server_time);
    return true;
  } catch (err) {
    // 401 (token expired) or a network blip: leave local data intact and retry
    // on the next trigger. Anything unexpected is surfaced for debugging.
    if (!(err instanceof ApiError) && !(err instanceof TypeError)) {
      console.error("Sync failed", err);
    }
    return false;
  } finally {
    running = false;
  }
}

/**
 * First-run bootstrap: sync (pulling any existing server data), then seed the
 * default categories only if the account is genuinely empty afterwards — so a
 * returning user on a new device gets their real categories, not duplicates.
 */
export async function bootstrap(): Promise<void> {
  await runSync();
  const count = await db.categories.count();
  if (count === 0) {
    await seedDefaultCategoriesIfEmpty();
    // Push the freshly-seeded defaults up (no-op if offline; retried later).
    await runSync();
  }
}
