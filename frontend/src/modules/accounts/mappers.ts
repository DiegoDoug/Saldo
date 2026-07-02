/**
 * Mapping between the backend's snake_case account wire shape and the local
 * Dexie camelCase row. Mirrors the budgeting mappers.
 */

import type { AccountType, LocalAccount } from "../../db/db";

export interface WireAccount {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance: number;
  color: string;
  icon: string;
  position: number;
  archived: boolean;
  updated_at: string;
  deleted: boolean;
}

export function wireToLocalAccount(w: WireAccount): LocalAccount {
  return {
    id: w.id,
    name: w.name,
    type: w.type,
    currency: w.currency,
    openingBalance: w.opening_balance,
    color: w.color,
    icon: w.icon,
    position: w.position,
    archived: w.archived ? 1 : 0,
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function localAccountToSync(a: LocalAccount) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    opening_balance: a.openingBalance,
    color: a.color,
    icon: a.icon,
    position: a.position,
    archived: a.archived === 1,
    updated_at: a.updatedAt,
    deleted: a.deleted === 1,
  };
}
