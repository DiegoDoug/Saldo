/**
 * Mapping between the backend's snake_case net-worth wire shapes and the local
 * Dexie camelCase rows (assets, liabilities, snapshots).
 */

import type {
  AssetKind,
  LiabilityKind,
  LocalAsset,
  LocalLiability,
  LocalNetWorthSnapshot,
} from "../../db/db";

export interface WireAsset {
  id: string;
  name: string;
  kind: AssetKind;
  value: number;
  currency: string;
  updated_at: string;
  deleted: boolean;
}

export interface WireLiability {
  id: string;
  name: string;
  kind: LiabilityKind;
  balance: number;
  currency: string;
  interest_rate: number;
  updated_at: string;
  deleted: boolean;
}

export interface WireSnapshot {
  id: string;
  date: string;
  assets_total: number;
  liabilities_total: number;
  net_worth: number;
  currency: string;
  updated_at: string;
  deleted: boolean;
}

export function wireToLocalAsset(w: WireAsset): LocalAsset {
  return {
    id: w.id,
    name: w.name,
    kind: w.kind,
    value: w.value,
    currency: w.currency,
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function localAssetToSync(a: LocalAsset) {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    value: a.value,
    currency: a.currency,
    updated_at: a.updatedAt,
    deleted: a.deleted === 1,
  };
}

export function wireToLocalLiability(w: WireLiability): LocalLiability {
  return {
    id: w.id,
    name: w.name,
    kind: w.kind,
    balance: w.balance,
    currency: w.currency,
    interestRate: w.interest_rate,
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function localLiabilityToSync(l: LocalLiability) {
  return {
    id: l.id,
    name: l.name,
    kind: l.kind,
    balance: l.balance,
    currency: l.currency,
    interest_rate: l.interestRate,
    updated_at: l.updatedAt,
    deleted: l.deleted === 1,
  };
}

export function wireToLocalSnapshot(w: WireSnapshot): LocalNetWorthSnapshot {
  return {
    id: w.id,
    date: w.date,
    assetsTotal: w.assets_total,
    liabilitiesTotal: w.liabilities_total,
    netWorth: w.net_worth,
    currency: w.currency,
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function localSnapshotToSync(s: LocalNetWorthSnapshot) {
  return {
    id: s.id,
    date: s.date,
    assets_total: s.assetsTotal,
    liabilities_total: s.liabilitiesTotal,
    net_worth: s.netWorth,
    currency: s.currency,
    updated_at: s.updatedAt,
    deleted: s.deleted === 1,
  };
}
