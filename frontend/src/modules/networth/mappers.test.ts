import { describe, expect, it } from "vitest";

import {
  localAssetToSync,
  localLiabilityToSync,
  localSnapshotToSync,
  wireToLocalAsset,
  wireToLocalLiability,
  wireToLocalSnapshot,
  type WireAsset,
  type WireLiability,
  type WireSnapshot,
} from "./mappers";

describe("net-worth mappers", () => {
  it("round-trips an asset", () => {
    const wire: WireAsset = {
      id: "a1",
      name: "Piso",
      kind: "property",
      value: 200000,
      currency: "EUR",
      updated_at: "2026-01-01T10:00:00Z",
      deleted: false,
    };
    const local = wireToLocalAsset(wire);
    expect(local.value).toBe(200000);
    expect(wireToLocalAsset(localAssetToSync(local) as WireAsset)).toEqual(local);
  });

  it("round-trips a liability (interest_rate ↔ interestRate)", () => {
    const wire: WireLiability = {
      id: "l1",
      name: "Hipoteca",
      kind: "mortgage",
      balance: 120000,
      currency: "EUR",
      interest_rate: 2.5,
      updated_at: "2026-01-01T10:00:00Z",
      deleted: true,
    };
    const local = wireToLocalLiability(wire);
    expect(local.interestRate).toBe(2.5);
    expect(local.deleted).toBe(1);
    expect(wireToLocalLiability(localLiabilityToSync(local) as WireLiability)).toEqual(local);
  });

  it("round-trips a snapshot", () => {
    const wire: WireSnapshot = {
      id: "s1",
      date: "2026-01-15",
      assets_total: 6000,
      liabilities_total: 2000,
      net_worth: 4000,
      currency: "EUR",
      updated_at: "2026-01-15T10:00:00Z",
      deleted: false,
    };
    const local = wireToLocalSnapshot(wire);
    expect(local.netWorth).toBe(4000);
    expect(wireToLocalSnapshot(localSnapshotToSync(local) as WireSnapshot)).toEqual(local);
  });
});
