/**
 * `confirmDraft` turns a reviewed draft into Dexie rows through the existing
 * localRepos. Those repos are mocked here (jsdom has no IndexedDB); the point
 * of these tests is the reconciliation logic: create-first ordering, id vs.
 * name resolution, the default-account fallback, and that transfers and
 * zero/negative amounts are skipped.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftBankAnalysis, DraftMovement } from "./api";
import { confirmDraft } from "./confirmImport";

const { addAccount, addCategory, addMerchant, ensureTags, addTransaction, addTransfer } =
  vi.hoisted(() => ({
    addAccount: vi.fn(),
    addCategory: vi.fn(),
    addMerchant: vi.fn(),
    ensureTags: vi.fn(),
    addTransaction: vi.fn(),
    addTransfer: vi.fn(),
  }));

vi.mock("../accounts/localRepo", () => ({ addAccount }));
vi.mock("../budgeting/localRepo", () => ({ addCategory }));
vi.mock("../merchants/localRepo", () => ({ addMerchant }));
vi.mock("../tags/localRepo", () => ({ ensureTags }));
vi.mock("../transactions/localRepo", () => ({ addTransaction, addTransfer }));

function movement(overrides: Partial<DraftMovement> = {}): DraftMovement {
  return {
    date: "2026-06-01",
    description: "X",
    type: "expense",
    amount: 10,
    currency: "EUR",
    accountId: null,
    accountRef: null,
    transferAccountId: null,
    transferAccountRef: null,
    categoryId: null,
    categoryRef: null,
    merchantId: null,
    merchantRef: null,
    tags: [],
    isRecurring: false,
    notes: null,
    confidence: 0.9,
    ...overrides,
  };
}

function draft(overrides: Partial<DraftBankAnalysis> = {}): DraftBankAnalysis {
  return {
    bankName: null,
    currency: "EUR",
    movements: [],
    newAccounts: [],
    newCategories: [],
    newMerchants: [],
    newTags: [],
    warnings: [],
    overallConfidence: 0.9,
    ...overrides,
  };
}

beforeEach(() => {
  addAccount.mockReset().mockResolvedValue("new-acc");
  addCategory.mockReset().mockResolvedValue("new-cat");
  addMerchant.mockReset().mockResolvedValue("new-merch");
  ensureTags.mockReset().mockResolvedValue(undefined);
  addTransaction.mockReset().mockResolvedValue("tx");
  addTransfer.mockReset().mockResolvedValue("tx");
});

describe("confirmDraft", () => {
  it("creates proposed entities first, then resolves movement refs to their ids", async () => {
    const d = draft({
      newAccounts: [{ name: "Cuenta principal", kind: "checking" }],
      newCategories: [{ name: "Supermercado", kind: "variable" }],
      newMerchants: [{ name: "Mercadona", kind: null }],
      newTags: [{ name: "compras", kind: null }],
    });
    const m = movement({
      accountRef: "Cuenta principal",
      categoryRef: "Supermercado",
      merchantRef: "Mercadona",
      tags: ["compras"],
    });

    const result = await confirmDraft(d, [m], "default-acc", "EUR");

    expect(addAccount).toHaveBeenCalledWith({
      name: "Cuenta principal",
      type: "checking",
      currency: "EUR",
    });
    expect(ensureTags).toHaveBeenCalledWith(["compras"]);
    expect(addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "new-acc",
        categoryId: "new-cat",
        merchantId: "new-merch",
        amount: 10,
        type: "expense",
      }),
    );
    expect(result.transactionCount).toBe(1);
  });

  it("falls back to the default account when a movement has none", async () => {
    await confirmDraft(draft(), [movement()], "default-acc", "EUR");
    expect(addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "default-acc" }),
    );
  });

  it("dedupes proposed entities created for many movements", async () => {
    const d = draft({ newCategories: [{ name: "Supermercado", kind: "variable" }] });
    const movements = [
      movement({ categoryRef: "Supermercado" }),
      movement({ categoryRef: "supermercado" }), // same, different case
    ];
    await confirmDraft(d, movements, "default-acc", "EUR");
    expect(addCategory).toHaveBeenCalledTimes(1);
    expect(addTransaction).toHaveBeenCalledTimes(2);
  });

  it("skips non-positive amounts", async () => {
    const movements = [movement({ amount: 0 }), movement({ amount: null }), movement({ amount: 5 })];
    const result = await confirmDraft(draft(), movements, "default-acc", "EUR");
    expect(addTransaction).toHaveBeenCalledTimes(1);
    expect(result.transactionCount).toBe(1);
  });

  it("writes a transfer with both legs, resolving the destination account", async () => {
    const d = draft({
      newAccounts: [
        { name: "Origen", kind: "checking" },
        { name: "Ahorro", kind: "savings" },
      ],
    });
    const m = movement({
      type: "transfer",
      amount: 200,
      accountRef: "Origen",
      transferAccountRef: "Ahorro",
    });
    addAccount.mockReset();
    addAccount.mockResolvedValueOnce("id-origen").mockResolvedValueOnce("id-ahorro");

    const result = await confirmDraft(d, [m], "default-acc", "EUR");

    expect(addTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ fromAccountId: "id-origen", toAccountId: "id-ahorro", amount: 200 }),
    );
    expect(addTransaction).not.toHaveBeenCalled();
    expect(result.transactionCount).toBe(1);
  });

  it("skips a transfer that can't resolve two distinct accounts", async () => {
    const m = movement({ type: "transfer", amount: 50, transferAccountRef: null });
    const result = await confirmDraft(draft(), [m], "default-acc", "EUR");
    expect(addTransfer).not.toHaveBeenCalled();
    expect(result.transactionCount).toBe(0);
  });
});
