import { describe, expect, it } from "vitest";

import { db } from "./db";

describe("Dexie schema", () => {
  it("declares the tables that mirror the backend shape", () => {
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      "accounts",
      "assets",
      "categories",
      "entries",
      "goals",
      "layout",
      "liabilities",
      "merchants",
      "meta",
      "netWorthSnapshots",
      "profile",
      "recurringRules",
      "tags",
      "transactions",
    ]);
  });

  it("names the database 'saldo'", () => {
    expect(db.name).toBe("saldo");
  });
});
