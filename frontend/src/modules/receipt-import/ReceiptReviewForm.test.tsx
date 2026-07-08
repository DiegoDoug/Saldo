/**
 * `ReceiptReviewForm` reads accounts/categories/merchants via Dexie
 * (`useLiveQuery`), which needs a real IndexedDB — unavailable in jsdom (this
 * project has no `fake-indexeddb` dependency, and no other Dexie-hook-backed
 * component has a test either; `TransactionsPage.tsx`'s own `AddTransactionForm`
 * is verified by hand in a browser, not unit-tested). Consistent with that,
 * these tests mock the hooks/localRepo modules rather than hitting real Dexie.
 */

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/utils";
import type { LocalAccount, LocalCategory, LocalMerchant } from "../../db/db";
import type { DraftReceiptAnalysis, ReceiptImport } from "./api";
import { ReceiptReviewForm } from "./ReceiptReviewForm";

const ACCOUNT: LocalAccount = {
  id: "acc1",
  name: "Cuenta corriente",
  type: "checking",
  currency: "EUR",
  openingBalance: 0,
  color: "",
  icon: "",
  position: 0,
  archived: 0,
  updatedAt: "2026-01-01T00:00:00Z",
  deleted: 0,
};

const MERCHANT: LocalMerchant = {
  id: "m1",
  name: "Mercadona",
  logo: "",
  color: "",
  categoryId: null,
  website: "",
  location: "",
  recurringProbability: 0,
  updatedAt: "2026-01-01T00:00:00Z",
  deleted: 0,
};

const CATEGORY: LocalCategory = {
  id: "c1",
  name: "Supermercado",
  kind: "variable",
  position: 0,
  parentId: null,
  color: null,
  icon: null,
  updatedAt: "2026-01-01T00:00:00Z",
  deleted: 0,
};

const { useAccounts } = vi.hoisted(() => ({ useAccounts: vi.fn() }));
const { useCategories } = vi.hoisted(() => ({ useCategories: vi.fn() }));
const { useMerchants } = vi.hoisted(() => ({ useMerchants: vi.fn() }));
const { addMerchant } = vi.hoisted(() => ({ addMerchant: vi.fn() }));
const { addCategory } = vi.hoisted(() => ({ addCategory: vi.fn() }));
const { addTransaction } = vi.hoisted(() => ({ addTransaction: vi.fn() }));
const { confirmReceipt } = vi.hoisted(() => ({ confirmReceipt: vi.fn() }));

vi.mock("../accounts/hooks", () => ({ useAccounts }));
vi.mock("../budgeting/hooks", () => ({ useCategories }));
vi.mock("../merchants/hooks", () => ({ useMerchants }));
vi.mock("../merchants/localRepo", () => ({ addMerchant }));
vi.mock("../budgeting/localRepo", () => ({ addCategory }));
vi.mock("../transactions/localRepo", () => ({ addTransaction }));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, confirmReceipt };
});

const RECEIPT: ReceiptImport = {
  id: "r1",
  status: "ready",
  errorMessage: null,
  duplicateOf: null,
  linkedTransactionId: null,
  createdAt: "2026-07-08T00:00:00",
  draft: null,
};

function makeDraft(overrides: Partial<DraftReceiptAnalysis> = {}): DraftReceiptAnalysis {
  return {
    merchant: {
      rawText: "Mercadona",
      matchedMerchantId: "m1",
      suggestedName: null,
      matchType: "exact",
      confidence: 0.97,
    },
    category: { matchedCategoryId: "c1", suggestedName: null, matchType: "merchant_default", confidence: 0.9 },
    amount: { value: 12.5, confidence: 0.95 },
    currency: { value: "EUR", confidence: 0.9 },
    date: { value: "2026-07-06", confidence: 0.9 },
    tax: { value: null, confidence: null },
    paymentMethod: { value: null, confidence: null },
    receiptNumber: { value: null, confidence: null },
    address: { value: null, confidence: null },
    notes: { value: null, confidence: null },
    lineItems: [],
    warnings: [],
    missingFields: [],
    overallConfidence: 0.9,
    ...overrides,
  };
}

beforeEach(() => {
  useAccounts.mockReturnValue([ACCOUNT]);
  useCategories.mockReturnValue([CATEGORY]);
  useMerchants.mockReturnValue([MERCHANT]);
  addMerchant.mockReset().mockResolvedValue("new-merchant-id");
  addCategory.mockReset().mockResolvedValue("new-category-id");
  addTransaction.mockReset().mockResolvedValue("tx1");
  confirmReceipt.mockReset().mockResolvedValue(RECEIPT);
});

describe("ReceiptReviewForm", () => {
  it("prefills fields from the draft", () => {
    renderWithProviders(
      <ReceiptReviewForm
        receipt={RECEIPT}
        draft={makeDraft()}
        onConfirmed={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Comercio")).toHaveValue("Mercadona");
    expect(screen.getByLabelText("Categoría")).toHaveValue("Supermercado");
    expect(screen.getByLabelText("Importe")).toHaveValue("12.5");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-07-06");
  });

  it("flags a low-confidence field for review", () => {
    renderWithProviders(
      <ReceiptReviewForm
        receipt={RECEIPT}
        draft={makeDraft({ amount: { value: 12.5, confidence: 0.4 } })}
        onConfirmed={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    // Amount uses the stricter 0.9 threshold, so 0.95 confidence (category)
    // stays clean while a 0.4-confidence amount is flagged.
    const badges = screen.getAllByText("Revisar");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("creates a new merchant inline and selects it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptReviewForm
        receipt={RECEIPT}
        draft={makeDraft()}
        onConfirmed={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const merchantInput = screen.getByLabelText("Comercio");
    await user.clear(merchantInput);
    await user.type(merchantInput, "Nueva Tienda");
    await user.click(await screen.findByRole("button", { name: /Crear «Nueva Tienda»/ }));

    await waitFor(() => expect(addMerchant).toHaveBeenCalledWith({ name: "Nueva Tienda", categoryId: "c1" }));
  });

  it("confirms: writes the transaction, links the receipt, and reports success", async () => {
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    renderWithProviders(
      <ReceiptReviewForm
        receipt={RECEIPT}
        draft={makeDraft()}
        onConfirmed={onConfirmed}
        onDiscard={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Confirmar/ }));

    await waitFor(() => expect(addTransaction).toHaveBeenCalled());
    expect(addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "expense",
        amount: 12.5,
        currency: "EUR",
        accountId: "acc1",
        categoryId: "c1",
        merchantId: "m1",
        date: "2026-07-06",
      }),
    );
    expect(onConfirmed).toHaveBeenCalled();
    await waitFor(() =>
      expect(confirmReceipt).toHaveBeenCalledWith("r1", "tx1"),
    );
  });

  it("calls onDiscard from the Descartar button", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    renderWithProviders(
      <ReceiptReviewForm
        receipt={RECEIPT}
        draft={makeDraft()}
        onConfirmed={vi.fn()}
        onDiscard={onDiscard}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onDiscard).toHaveBeenCalled();
  });
});
