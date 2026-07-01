/** Sync API calls (push local changes, pull remote changes). */

import { apiRequest } from "../../shared/api/client";
import type { WireCategory, WireEntry } from "../budgeting/mappers";

interface SyncResponse {
  categories: WireCategory[];
  entries: WireEntry[];
  server_time: string;
}

export function pushSync(
  categories: unknown[],
  entries: unknown[],
): Promise<SyncResponse> {
  return apiRequest<SyncResponse>("/sync/push", {
    method: "POST",
    json: { categories, entries },
  });
}

export function pullSync(since?: string): Promise<SyncResponse> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return apiRequest<SyncResponse>(`/sync/pull${query}`);
}
