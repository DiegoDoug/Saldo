/** Sync API calls (push local changes, pull remote changes). */

import { apiRequest } from "../../shared/api/client";
import type { WireAccount } from "../accounts/mappers";
import type { WireRecurringRule } from "../bills/mappers";
import type { WireCategory, WireEntry } from "../budgeting/mappers";
import type { WireGoal } from "../goals/mappers";
import type { WireMerchant } from "../merchants/mappers";
import type { WireTransaction } from "../transactions/mappers";

interface SyncResponse {
  accounts?: WireAccount[];
  transactions?: WireTransaction[];
  merchants?: WireMerchant[];
  recurring_rules?: WireRecurringRule[];
  goals?: WireGoal[];
  categories: WireCategory[];
  entries: WireEntry[];
  server_time: string;
}

export interface PushPayload {
  accounts?: unknown[];
  transactions?: unknown[];
  merchants?: unknown[];
  recurring_rules?: unknown[];
  goals?: unknown[];
  categories?: unknown[];
  entries?: unknown[];
}

export function pushSync(payload: PushPayload): Promise<SyncResponse> {
  return apiRequest<SyncResponse>("/sync/push", {
    method: "POST",
    json: {
      accounts: payload.accounts ?? [],
      transactions: payload.transactions ?? [],
      merchants: payload.merchants ?? [],
      recurring_rules: payload.recurring_rules ?? [],
      goals: payload.goals ?? [],
      categories: payload.categories ?? [],
      entries: payload.entries ?? [],
    },
  });
}

export function pullSync(since?: string): Promise<SyncResponse> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return apiRequest<SyncResponse>(`/sync/pull${query}`);
}
