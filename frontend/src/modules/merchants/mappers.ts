/**
 * Mapping between the backend's snake_case merchant wire shape and the local
 * Dexie camelCase row.
 */

import type { LocalMerchant } from "../../db/db";

export interface WireMerchant {
  id: string;
  name: string;
  logo: string;
  color: string;
  category_id: string | null;
  website: string;
  location: string;
  recurring_probability: number;
  updated_at: string;
  deleted: boolean;
}

export function wireToLocalMerchant(w: WireMerchant): LocalMerchant {
  return {
    id: w.id,
    name: w.name,
    logo: w.logo,
    color: w.color,
    categoryId: w.category_id,
    website: w.website,
    location: w.location,
    recurringProbability: w.recurring_probability,
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function localMerchantToSync(m: LocalMerchant) {
  return {
    id: m.id,
    name: m.name,
    logo: m.logo,
    color: m.color,
    category_id: m.categoryId,
    website: m.website,
    location: m.location,
    recurring_probability: m.recurringProbability,
    updated_at: m.updatedAt,
    deleted: m.deleted === 1,
  };
}
