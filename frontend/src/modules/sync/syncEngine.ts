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
import {
  db,
  type LocalAccount,
  type LocalCategory,
  type LocalEntry,
  type LocalAsset,
  type LocalGoal,
  type LocalLiability,
  type LocalMerchant,
  type LocalNetWorthSnapshot,
  type LocalRecurringRule,
  type LocalTransaction,
} from "../../db/db";
import {
  localAccountToSync,
  wireToLocalAccount,
  type WireAccount,
} from "../accounts/mappers";
import {
  localRuleToSync,
  wireToLocalRule,
  type WireRecurringRule,
} from "../bills/mappers";
import { localGoalToSync, wireToLocalGoal, type WireGoal } from "../goals/mappers";
import {
  localAssetToSync,
  localLiabilityToSync,
  localSnapshotToSync,
  wireToLocalAsset,
  wireToLocalLiability,
  wireToLocalSnapshot,
  type WireAsset,
  type WireLiability,
  type WireSnapshot,
} from "../networth/mappers";
import {
  localMerchantToSync,
  wireToLocalMerchant,
  type WireMerchant,
} from "../merchants/mappers";
import {
  localCategoryToSync,
  localEntryToSync,
  wireToLocalCategory,
  wireToLocalEntry,
  type WireCategory,
  type WireEntry,
} from "../budgeting/mappers";
import { seedDefaultCategoriesIfEmpty } from "../budgeting/localRepo";
import {
  localTransactionToSync,
  wireToLocalTransaction,
  type WireTransaction,
} from "../transactions/mappers";
import { pullSync, pushSync } from "./api";
import { useSyncStore } from "./syncStore";

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

async function mergeAccounts(incoming: WireAccount[] = []): Promise<void> {
  for (const wa of incoming) {
    const local = await db.accounts.get(wa.id);
    const next = wireToLocalAccount(wa);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.accounts.put(next);
    }
  }
}

async function mergeTransactions(incoming: WireTransaction[] = []): Promise<void> {
  for (const wt of incoming) {
    const local = await db.transactions.get(wt.id);
    const next = wireToLocalTransaction(wt);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.transactions.put(next);
    }
  }
}

async function mergeMerchants(incoming: WireMerchant[] = []): Promise<void> {
  for (const wm of incoming) {
    const local = await db.merchants.get(wm.id);
    const next = wireToLocalMerchant(wm);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.merchants.put(next);
    }
  }
}

async function mergeRules(incoming: WireRecurringRule[] = []): Promise<void> {
  for (const wr of incoming) {
    const local = await db.recurringRules.get(wr.id);
    const next = wireToLocalRule(wr);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.recurringRules.put(next);
    }
  }
}

async function mergeGoals(incoming: WireGoal[] = []): Promise<void> {
  for (const wg of incoming) {
    const local = await db.goals.get(wg.id);
    const next = wireToLocalGoal(wg);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.goals.put(next);
    }
  }
}

async function mergeAssets(incoming: WireAsset[] = []): Promise<void> {
  for (const wa of incoming) {
    const local = await db.assets.get(wa.id);
    const next = wireToLocalAsset(wa);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.assets.put(next);
    }
  }
}

async function mergeLiabilities(incoming: WireLiability[] = []): Promise<void> {
  for (const wl of incoming) {
    const local = await db.liabilities.get(wl.id);
    const next = wireToLocalLiability(wl);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.liabilities.put(next);
    }
  }
}

async function mergeSnapshots(incoming: WireSnapshot[] = []): Promise<void> {
  for (const ws of incoming) {
    const local = await db.netWorthSnapshots.get(ws.id);
    const next = wireToLocalSnapshot(ws);
    if (!local || toEpoch(next.updatedAt) >= toEpoch(local.updatedAt)) {
      await db.netWorthSnapshots.put(next);
    }
  }
}

function changedSince<
  T extends
    | LocalAccount
    | LocalCategory
    | LocalEntry
    | LocalTransaction
    | LocalMerchant
    | LocalRecurringRule
    | LocalGoal
    | LocalAsset
    | LocalLiability
    | LocalNetWorthSnapshot,
>(rows: T[], since?: string): T[] {
  if (!since) return rows;
  const cutoff = toEpoch(since);
  return rows.filter((r) => toEpoch(r.updatedAt) > cutoff);
}

/**
 * Count how many pushed records the server overwrote: a "conflict" is a record
 * we sent whose authoritative version came back with a strictly newer
 * timestamp (the server's copy won last-write-wins).
 */
function countConflicts(
  sent: { id: string; updated_at: string }[],
  resolved: { id: string; updated_at: string }[],
): number {
  const sentAt = new Map(sent.map((r) => [r.id, toEpoch(r.updated_at)]));
  let conflicts = 0;
  for (const r of resolved) {
    const mine = sentAt.get(r.id);
    if (mine !== undefined && toEpoch(r.updated_at) > mine) conflicts += 1;
  }
  return conflicts;
}

let inflight: Promise<boolean> | null = null;

/**
 * Run one sync pass. Returns true if it completed, false if it was skipped
 * (offline / unauthenticated). Concurrent callers share a single in-flight run
 * (so `await runSync()` always reflects a *completed* sync — `bootstrap` relies
 * on this before deciding whether to seed defaults). Never throws for expected
 * offline/auth conditions — background sync must not crash the UI.
 */
export function runSync(): Promise<boolean> {
  const store = useSyncStore.getState();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    store.setStatus("offline");
    return Promise.resolve(false);
  }
  if (inflight) return inflight;
  inflight = doSync().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doSync(): Promise<boolean> {
  const store = useSyncStore.getState();
  store.setStatus("syncing");
  try {
    const since = await getMeta(LAST_SYNC_KEY);

    const dirtyAccounts = changedSince(await db.accounts.toArray(), since).map(localAccountToSync);
    const dirtyMerchants = changedSince(await db.merchants.toArray(), since).map(
      localMerchantToSync,
    );
    const dirtyRules = changedSince(await db.recurringRules.toArray(), since).map(localRuleToSync);
    const dirtyGoals = changedSince(await db.goals.toArray(), since).map(localGoalToSync);
    const dirtyAssets = changedSince(await db.assets.toArray(), since).map(localAssetToSync);
    const dirtyLiabilities = changedSince(await db.liabilities.toArray(), since).map(
      localLiabilityToSync,
    );
    const dirtySnapshots = changedSince(await db.netWorthSnapshots.toArray(), since).map(
      localSnapshotToSync,
    );
    const dirtyTransactions = changedSince(await db.transactions.toArray(), since).map(
      localTransactionToSync,
    );
    const dirtyCategories = changedSince(await db.categories.toArray(), since).map(
      localCategoryToSync,
    );
    const dirtyEntries = changedSince(await db.entries.toArray(), since).map(localEntryToSync);

    if (
      dirtyAccounts.length ||
      dirtyMerchants.length ||
      dirtyRules.length ||
      dirtyGoals.length ||
      dirtyAssets.length ||
      dirtyLiabilities.length ||
      dirtySnapshots.length ||
      dirtyTransactions.length ||
      dirtyCategories.length ||
      dirtyEntries.length
    ) {
      const pushed = await pushSync({
        accounts: dirtyAccounts,
        merchants: dirtyMerchants,
        recurring_rules: dirtyRules,
        goals: dirtyGoals,
        assets: dirtyAssets,
        liabilities: dirtyLiabilities,
        snapshots: dirtySnapshots,
        transactions: dirtyTransactions,
        categories: dirtyCategories,
        entries: dirtyEntries,
      });
      const conflicts =
        countConflicts(dirtyAccounts, pushed.accounts ?? []) +
        countConflicts(dirtyMerchants, pushed.merchants ?? []) +
        countConflicts(dirtyRules, pushed.recurring_rules ?? []) +
        countConflicts(dirtyGoals, pushed.goals ?? []) +
        countConflicts(dirtyAssets, pushed.assets ?? []) +
        countConflicts(dirtyLiabilities, pushed.liabilities ?? []) +
        countConflicts(dirtySnapshots, pushed.snapshots ?? []) +
        countConflicts(dirtyTransactions, pushed.transactions ?? []) +
        countConflicts(dirtyCategories, pushed.categories) +
        countConflicts(dirtyEntries, pushed.entries);
      if (conflicts > 0) store.addConflicts(conflicts);
      await mergeAccounts(pushed.accounts);
      await mergeMerchants(pushed.merchants);
      await mergeRules(pushed.recurring_rules);
      await mergeGoals(pushed.goals);
      await mergeAssets(pushed.assets);
      await mergeLiabilities(pushed.liabilities);
      await mergeSnapshots(pushed.snapshots);
      await mergeTransactions(pushed.transactions);
      await mergeCategories(pushed.categories);
      await mergeEntries(pushed.entries);
    }

    const pulled = await pullSync(since);
    await mergeAccounts(pulled.accounts);
    await mergeMerchants(pulled.merchants);
    await mergeRules(pulled.recurring_rules);
    await mergeGoals(pulled.goals);
    await mergeAssets(pulled.assets);
    await mergeLiabilities(pulled.liabilities);
    await mergeSnapshots(pulled.snapshots);
    await mergeTransactions(pulled.transactions);
    await mergeCategories(pulled.categories);
    await mergeEntries(pulled.entries);
    await setMeta(LAST_SYNC_KEY, pulled.server_time);
    store.setLastSyncAt(pulled.server_time);
    store.setStatus("idle");
    return true;
  } catch (err) {
    // 401 (token expired) or a network blip: leave local data intact and retry
    // on the next trigger. Anything unexpected is surfaced for debugging.
    store.setStatus("error");
    if (!(err instanceof ApiError) && !(err instanceof TypeError)) {
      console.error("Sync failed", err);
    }
    return false;
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
