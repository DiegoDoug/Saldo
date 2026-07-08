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

export async function adoptLocalProfile(session: Profile): Promise<void> {
  const existing = await db.profile.toCollection().first();
  if (existing && existing.id !== session.id) {
    await db.transaction("rw", db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
    queryClient.clear();
  }
  await db.profile.put(session);
}
