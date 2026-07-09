/** Sync API calls (push local changes, pull remote changes). */

import { apiRequest } from "../../shared/api/client";
import type { WireAccount } from "../accounts/mappers";
import type { WireRecurringRule } from "../bills/mappers";
import type { WireCategory, WireEntry } from "../budgeting/mappers";
import type { WireGoal } from "../goals/mappers";
import type { WireMerchant } from "../merchants/mappers";
import type { WireAsset, WireLiability, WireSnapshot } from "../networth/mappers";
import type { WireTag } from "../tags/mappers";
import type { WireTransaction } from "../transactions/mappers";

interface SyncResponse {
  accounts?: WireAccount[];
  transactions?: WireTransaction[];
  merchants?: WireMerchant[];
  recurring_rules?: WireRecurringRule[];
  goals?: WireGoal[];
  assets?: WireAsset[];
  liabilities?: WireLiability[];
  snapshots?: WireSnapshot[];
  categories: WireCategory[];
  entries: WireEntry[];
  tags?: WireTag[];
  /** Push only: ids the server refused because they belong to another user. */
  rejected_ids?: string[];
  server_time: string;
}

export interface PushPayload {
  accounts?: unknown[];
  transactions?: unknown[];
  merchants?: unknown[];
  recurring_rules?: unknown[];
  goals?: unknown[];
  assets?: unknown[];
  liabilities?: unknown[];
  snapshots?: unknown[];
  categories?: unknown[];
  entries?: unknown[];
  tags?: unknown[];
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
      assets: payload.assets ?? [],
      liabilities: payload.liabilities ?? [],
      snapshots: payload.snapshots ?? [],
      categories: payload.categories ?? [],
      entries: payload.entries ?? [],
      tags: payload.tags ?? [],
    },
  });
}

export function pullSync(since?: string): Promise<SyncResponse> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return apiRequest<SyncResponse>(`/sync/pull${query}`);
}
