/**
 * State-machine-level tests for the dialog (capture -> processing ->
 * ready/failed -> confirmed). The "ready" step's own field-level behavior
 * (prefill, confidence badges, inline create, confirm) is covered in depth by
 * `ReceiptReviewForm.test.tsx`; here it's mocked out to a fixed set of
 * accounts/categories/merchants, same reasoning as that file (jsdom has no
 * IndexedDB, so Dexie-backed hooks are mocked rather than hit for real).
 */

import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalAccount, LocalCategory, LocalMerchant } from "../../db/db";
import { ApiError } from "../../shared/api/client";
import { renderWithProviders } from "../../test/utils";
import type { ReceiptImport } from "./api";
import { ReceiptImportDialog } from "./ReceiptImportDialog";

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
const { addTransaction } = vi.hoisted(() => ({ addTransaction: vi.fn() }));

vi.mock("../accounts/hooks", () => ({ useAccounts }));
vi.mock("../budgeting/hooks", () => ({ useCategories }));
vi.mock("../merchants/hooks", () => ({ useMerchants }));
vi.mock("../transactions/localRepo", () => ({ addTransaction }));

const { uploadReceipt, getReceipt, discardReceipt, confirmReceipt } = vi.hoisted(() => ({
  uploadReceipt: vi.fn(),
  getReceipt: vi.fn(),
  discardReceipt: vi.fn(),
  confirmReceipt: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, uploadReceipt, getReceipt, discardReceipt, confirmReceipt };
});

function makeFile() {
  return new File([new Uint8Array(10)], "recibo.jpg", { type: "image/jpeg" });
}

const READY_RECEIPT: ReceiptImport = {
  id: "r1",
  status: "ready",
  errorMessage: null,
  duplicateOf: null,
  linkedTransactionId: null,
  createdAt: "2026-07-08T00:00:00",
  draft: {
    merchant: {
      rawText: "Mercadona",
      matchedMerchantId: "m1",
      suggestedName: null,
      matchType: "exact",
      confidence: 0.97,
    },
    category: {
      matchedCategoryId: "c1",
      suggestedName: null,
      matchType: "merchant_default",
      confidence: 0.9,
    },
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
  },
};

beforeEach(() => {
  useAccounts.mockReturnValue([ACCOUNT]);
  useCategories.mockReturnValue([CATEGORY]);
  useMerchants.mockReturnValue([MERCHANT]);
  addTransaction.mockReset().mockResolvedValue("tx1");
  uploadReceipt.mockReset();
  getReceipt.mockReset();
  discardReceipt.mockReset();
  confirmReceipt.mockReset().mockResolvedValue(READY_RECEIPT);
});

describe("ReceiptImportDialog", () => {
  it("shows the capture step initially", () => {
    renderWithProviders(<ReceiptImportDialog onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Escanear recibo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Elegir foto del recibo")).toBeInTheDocument();
  });

  it("uploads a file and shows the editable review form prefilled from the draft", async () => {
    const user = userEvent.setup();
    uploadReceipt.mockResolvedValue({ ...READY_RECEIPT, status: "processing", draft: null });
    getReceipt.mockResolvedValue(READY_RECEIPT);

    renderWithProviders(<ReceiptImportDialog onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Elegir foto del recibo"), makeFile());

    expect(await screen.findByLabelText("Comercio")).toHaveValue("Mercadona");
    expect(screen.getByLabelText("Importe")).toHaveValue("12.5");
    expect(getReceipt).toHaveBeenCalledWith("r1");
  });

  it("shows the failure state with a retry action", async () => {
    const user = userEvent.setup();
    uploadReceipt.mockResolvedValue({ ...READY_RECEIPT, status: "processing", draft: null });
    getReceipt.mockResolvedValue({
      ...READY_RECEIPT,
      status: "failed",
      draft: null,
      errorMessage: "DeepSeek is down",
    });

    renderWithProviders(<ReceiptImportDialog onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Elegir foto del recibo"), makeFile());

    expect(await screen.findByText("DeepSeek is down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("shows a friendly message when the feature is disabled (503)", async () => {
    const user = userEvent.setup();
    uploadReceipt.mockRejectedValue(new ApiError(503, null, "disabled"));

    renderWithProviders(<ReceiptImportDialog onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Elegir foto del recibo"), makeFile());

    expect(
      await screen.findByText(/no está configurado en este servidor/),
    ).toBeInTheDocument();
  });

  it("discards the receipt and closes on demand", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    uploadReceipt.mockResolvedValue({ ...READY_RECEIPT, status: "processing", draft: null });
    getReceipt.mockResolvedValue(READY_RECEIPT);
    discardReceipt.mockResolvedValue(undefined);

    renderWithProviders(<ReceiptImportDialog onClose={onClose} />);
    await user.upload(screen.getByLabelText("Elegir foto del recibo"), makeFile());
    await screen.findByLabelText("Comercio");

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    // TanStack Query v5 calls the mutation function with a second (context)
    // argument, hence `expect.anything()` rather than a bare `("r1")`.
    await waitFor(() => expect(discardReceipt).toHaveBeenCalledWith("r1", expect.anything()));
    expect(onClose).toHaveBeenCalled();
  });

  it("confirming shows the success step", async () => {
    const user = userEvent.setup();
    uploadReceipt.mockResolvedValue({ ...READY_RECEIPT, status: "processing", draft: null });
    getReceipt.mockResolvedValue(READY_RECEIPT);

    renderWithProviders(<ReceiptImportDialog onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Elegir foto del recibo"), makeFile());
    await screen.findByLabelText("Comercio");

    await user.click(screen.getByRole("button", { name: /Confirmar/ }));

    expect(await screen.findByText(/Movimiento guardado/)).toBeInTheDocument();
  });
});
