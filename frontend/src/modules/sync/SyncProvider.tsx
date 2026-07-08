/**
 * Drives background sync: runs a pass when the user is authenticated, again
 * whenever the browser regains connectivity, and on a gentle interval. Sync
 * never blocks the UI — writes have already landed in Dexie.
 */

import { type ReactNode, useEffect } from "react";

import { runLayoutSync } from "../dashboard/layoutSync";
import { useAuthStore } from "../identity/authStore";
import { bootstrap, runSync } from "./syncEngine";

const SYNC_INTERVAL_MS = 30_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    // Relies on callers never setting `token` in the auth store until any
    // local-data wipe for an account switch has finished (see
    // identity/hooks.ts's loginAndLoadProfile) -- this effect starts syncing
    // the instant `token` changes, with no re-check of its own.
    if (!token) return;
    void bootstrap().then(() => runLayoutSync());

    const onReconnect = () => {
      void runSync();
      void runLayoutSync();
    };
    window.addEventListener("online", onReconnect);
    const interval = window.setInterval(() => void runSync(), SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onReconnect);
      window.clearInterval(interval);
    };
  }, [token]);

  return <>{children}</>;
}
