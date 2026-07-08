/**
 * Scan-receipt dialog: capture -> uploading -> processing -> ready|failed ->
 * confirmed.
 *
 * Reuses `ForgotPasswordDialog`'s modal shell and internal state-machine
 * pattern (`identity/ForgotPasswordDialog.tsx`) rather than a new route —
 * this is a dialog over the transactions list, not its own page (see
 * docs/receipt-import/06-frontend-ux-flow.md §2).
 *
 * The "ready" step renders the real, editable `ReceiptReviewForm` — the AI
 * pipeline only ever produces a draft here; the form is what actually writes
 * a Transaction, and only once the user confirms it.
 */

import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "../../shared/api/client";
import { type ReceiptImport, isReceiptPending } from "./api";
import { useDiscardReceipt, useReceiptImport, useUploadReceipt } from "./hooks";
import { ReceiptDropZone } from "./ReceiptDropZone";
import { ReceiptReviewForm } from "./ReceiptReviewForm";

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return "El escaneo de recibos no está configurado en este servidor.";
  }
  if (error instanceof ApiError) return error.message || "No pudimos subir la foto.";
  return "No pudimos conectar con el servidor. Revisa tu conexión.";
}

export function ReceiptImportDialog({ onClose }: { onClose: () => void }) {
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const upload = useUploadReceipt();
  const discard = useDiscardReceipt();
  const receiptQuery = useReceiptImport(receiptId);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onFileSelected(file: File) {
    upload.mutate(file, {
      onSuccess: (receipt) => setReceiptId(receipt.id),
    });
  }

  function discardAndClose() {
    if (receiptId) discard.mutate(receiptId);
    onClose();
  }

  const receipt = receiptQuery.data;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card-panel auth-card-enter w-full max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-import-title"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="receipt-import-title" className="font-display text-xl font-semibold tracking-tight">
            Escanear recibo
          </h2>
          <button
            type="button"
            className="rounded-lg p-1 text-ink-soft hover:bg-mint-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-soft"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {confirmed ? (
          <ConfirmedStep onClose={onClose} />
        ) : !receiptId ? (
          <CaptureStep uploading={upload.isPending} error={upload.error} onSelect={onFileSelected} />
        ) : receipt && !isReceiptPending(receipt.status) ? (
          receipt.status === "failed" ? (
            <FailedStep
              receipt={receipt}
              onRetry={() => setReceiptId(null)}
              onDiscard={discardAndClose}
            />
          ) : receipt.draft ? (
            <ReceiptReviewForm
              receipt={receipt}
              draft={receipt.draft}
              onConfirmed={() => setConfirmed(true)}
              onDiscard={discardAndClose}
            />
          ) : (
            // Defensive only: the backend never reports "ready" without a
            // draft attached (see `pipeline.py`) — this is not a real state.
            <FailedStep
              receipt={{ ...receipt, errorMessage: "El recibo no tiene datos analizados." }}
              onRetry={() => setReceiptId(null)}
              onDiscard={discardAndClose}
            />
          )
        ) : (
          <ProcessingStep />
        )}
      </div>
    </div>
  );
}

function CaptureStep({
  uploading,
  error,
  onSelect,
}: {
  uploading: boolean;
  error: unknown;
  onSelect: (file: File) => void;
}) {
  if (uploading) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-sm text-ink-soft">
        <Loader2 className="animate-spin text-mint" size={28} aria-hidden="true" />
        Subiendo la foto…
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Sube una foto del recibo y Saldo propondrá el movimiento por ti.
      </p>
      {error != null && (
        <p className="rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral" role="alert">
          {uploadErrorMessage(error)}
        </p>
      )}
      <ReceiptDropZone onSelect={onSelect} />
    </div>
  );
}

function ProcessingStep() {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-sm text-ink-soft">
      <Loader2 className="animate-spin text-mint" size={28} aria-hidden="true" />
      Analizando el recibo…
    </div>
  );
}

function FailedStep({
  receipt,
  onRetry,
  onDiscard,
}: {
  receipt: ReceiptImport;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p
        className="flex items-start gap-2 rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral"
        role="alert"
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        {receipt.errorMessage || "No pudimos analizar el recibo."}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded-xl border border-line px-4 py-2 text-sm"
          onClick={onDiscard}
        >
          Descartar
        </button>
        <button type="button" className="btn-primary" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    </div>
  );
}

function ConfirmedStep({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl bg-mint-soft px-3 py-2 text-sm font-medium text-mint" role="status">
        Movimiento guardado. Se sincronizará automáticamente.
      </p>
      <button className="btn-primary w-full" type="button" onClick={onClose}>
        Entendido
      </button>
    </div>
  );
}
