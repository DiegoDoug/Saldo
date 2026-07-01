/**
 * Observable sync status for the UI: current phase, last successful sync, and a
 * count of records the server overwrote (last-write-wins conflicts) since the
 * user last dismissed the notice.
 */

import { create } from "zustand";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  conflicts: number;
  setStatus: (status: SyncStatus) => void;
  setLastSyncAt: (iso: string) => void;
  addConflicts: (n: number) => void;
  clearConflicts: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  lastSyncAt: null,
  conflicts: 0,
  setStatus: (status) => set({ status }),
  setLastSyncAt: (iso) => set({ lastSyncAt: iso }),
  addConflicts: (n) => set((s) => ({ conflicts: s.conflicts + n })),
  clearConflicts: () => set({ conflicts: 0 }),
}));
