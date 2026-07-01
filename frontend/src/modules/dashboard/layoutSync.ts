/**
 * Reconcile the local dashboard layout with the backend (`/layout`), so a
 * user's customization follows them across devices and survives offline.
 * Last-write-wins on `updatedAt`, consistent with the rest of sync.
 */

import { db, type LayoutData } from "../../db/db";
import { ApiError, apiRequest } from "../../shared/api/client";
import { toEpoch } from "../sync/syncEngine";

interface RemoteLayout {
  data: LayoutData | Record<string, never>;
  updated_at: string;
}

function hasData(data: RemoteLayout["data"]): data is LayoutData {
  return Object.keys(data).length > 0;
}

export async function runLayoutSync(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  try {
    const local = await db.layout.get("me");
    const remote = await apiRequest<RemoteLayout>("/layout");

    if (local && (!hasData(remote.data) || toEpoch(local.updatedAt) > toEpoch(remote.updated_at))) {
      // Local is newer (or the server has nothing) -> push local up.
      await apiRequest("/layout", {
        method: "PUT",
        json: { data: local.data, updated_at: local.updatedAt },
      });
    } else if (hasData(remote.data) && (!local || toEpoch(remote.updated_at) > toEpoch(local.updatedAt))) {
      // Server is newer -> adopt it locally.
      await db.layout.put({ id: "me", data: remote.data, updatedAt: remote.updated_at });
    }
  } catch (err) {
    // Offline / unauthenticated: keep local, retry later.
    if (!(err instanceof ApiError) && !(err instanceof TypeError)) {
      console.error("Layout sync failed", err);
    }
  }
}
