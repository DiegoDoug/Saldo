/** Sync API calls (push local changes, pull remote changes). */

import { apiRequest } from "../../shared/api/client";
import type { WireAccount } from "../accounts/mappers";
import type { WireCategory, WireEntry } from "../budgeting/mappers";
import type { WireTransaction } from "../transactions/mappers";

interface SyncResponse {
  accounts?: WireAccount[];
  transactions?: WireTransaction[];
  categories: WireCategory[];
  entries: WireEntry[];
  server_time: string;
}

export interface PushPayload {
  accounts?: unknown[];
  transactions?: unknown[];
  categories?: unknown[];
  entries?: unknown[];
}

export function pushSync(payload: PushPayload): Promise<SyncResponse> {
  return apiRequest<SyncResponse>("/sync/push", {
    method: "POST",
    json: {
      accounts: payload.accounts ?? [],
      transactions: payload.transactions ?? [],
      categories: payload.categories ?? [],
      entries: payload.entries ?? [],
    },
  });
}

export function pullSync(since?: string): Promise<SyncResponse> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return apiRequest<SyncResponse>(`/sync/pull${query}`);
}
