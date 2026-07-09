/**
 * Dexie ("saldo", see db.ts) is a single IndexedDB database shared by
 * whichever account is currently signed in on this browser -- none of its
 * tables are namespaced by user id. If a different account signs in (a fresh
 * registration or logging into another account on the same device), the
 * previous user's categories/entries/accounts/layout/etc. would otherwise
 * stay cached and render as if they belonged to the new account.
 *
 * Call `adoptLocalProfile` right after a successful login/registration and
 * before the auth store's token is set, so this runs before `SyncProvider`
 * (which reacts to the token) has a chance to sync against stale data.
 */

import { db } from "./db";
import { queryClient } from "../shared/queryClient";

interface Profile {
  id: string;
  email: string;
  defaultCurrency: string;
}

async function wipeAllTables(): Promise<void> {
  await db.transaction("rw", db.tables, () =>
    Promise.all(db.tables.map((table) => table.clear())),
  );
  queryClient.clear();
}

/** True when any table besides `profile` holds rows. */
async function hasLocalData(): Promise<boolean> {
  for (const table of db.tables) {
    if (table.name === "profile") continue;
    if ((await table.count()) > 0) return true;
  }
  return false;
}

export async function adoptLocalProfile(session: Profile): Promise<void> {
  try {
    const existing = await db.profile.toCollection().first();
    // Wipe when the device's data belongs to a different account -- and also
    // when there is data but no profile row at all (older app versions never
    // wrote one, so its absence proves nothing about who the data belongs to).
    if (existing ? existing.id !== session.id : await hasLocalData()) {
      await wipeAllTables();
    }
    await db.profile.put(session);
  } catch (err) {
    // A failed adoption must never leave another account's data adoptable by
    // this session: fall back to deleting the whole database. If even that
    // fails (IndexedDB unavailable), rethrow -- logging in would leak data.
    console.error("Local profile adoption failed; resetting local database", err);
    await db.delete();
    await db.open();
    queryClient.clear();
    await db.profile.put(session);
  }
}
