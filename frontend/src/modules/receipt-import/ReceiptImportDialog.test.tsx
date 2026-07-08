import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../shared/api/client";
import { renderWithProviders } from "../../test/utils";
import type { ReceiptImport } from "./api";
import { ReceiptImportDialog } from "./ReceiptImportDialog";

const { uploadReceipt, getReceipt, discardReceipt } = vi.hoisted(() => ({
  uploadReceipt: vi.fn(),
  getReceipt: vi.fn(),
  discardReceipt: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, uploadReceipt, getReceipt, discardReceipt };
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
      matchedMerchantId: null,
      suggestedName: "Mercadona",
      matchType: "none",
      confidence: 0.6,
    },
    category: { matchedCategoryId: null, suggestedName: null, matchType: "suggest_new", confidence: 0 },
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
    overallConfidence: 0.8,
  },
};

beforeEach(() => {
  uploadReceipt.mockReset();
  getReceipt.mockReset();
  discardReceipt.mockReset();
});

describe("ReceiptImportDialog", () => {
  it("shows the capture step initially", () => {
    renderWithProviders(<ReceiptImportDialog onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Escanear recibo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Elegir foto del recibo")).toBeInTheDocument();
  });

  it("uploads a file and shows the finished draft", async () => {
    const user = userEvent.setup();
    uploadReceipt.mockResolvedValue({ ...READY_RECEIPT, status: "processing", draft: null });
    getReceipt.mockResolvedValue(READY_RECEIPT);

    renderWithProviders(<ReceiptImportDialog onClose={vi.fn()} />);
    await user.upload(screen.getByLabelText("Elegir foto del recibo"), makeFile());

    expect(await screen.findByText("Mercadona")).toBeInTheDocument();
    expect(screen.getByText("12,50 €")).toBeInTheDocument();
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
    await screen.findByText("Mercadona");

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    // TanStack Query v5 calls the mutation function with a second (context)
    // argument, hence `expect.anything()` rather than a bare `("r1")`.
    await waitFor(() => expect(discardReceipt).toHaveBeenCalledWith("r1", expect.anything()));
    expect(onClose).toHaveBeenCalled();
  });
});
