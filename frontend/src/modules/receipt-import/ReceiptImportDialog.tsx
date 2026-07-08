/**
 * Scan-receipt dialog: capture -> uploading -> processing -> ready|failed.
 *
 * Reuses `ForgotPasswordDialog`'s modal shell and internal state-machine
 * pattern (`identity/ForgotPasswordDialog.tsx`) rather than a new route —
 * this is a dialog over the transactions list, not its own page (see
 * docs/receipt-import/06-frontend-ux-flow.md §2).
 *
 * **Stage 4 scope**: this dialog stops at showing the finished draft — the
 * full editable review form (confidence badges per field, inline
 * merchant/category creation, and the "Confirmar" action that actually
 * writes a Transaction to Dexie) is Stage 5. The "ready" step here is
 * deliberately a read-only summary, not a placeholder to be mistaken for the
 * real thing — see docs/receipt-import/07-implementation-roadmap.md.
 */

import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "../../shared/api/client";
import { formatMoney } from "../../shared/format";
import { type ReceiptImport, isReceiptPending } from "./api";
import { useDiscardReceipt, useReceiptImport, useUploadReceipt } from "./hooks";
import { ReceiptDropZone } from "./ReceiptDropZone";

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return "El escaneo de recibos no está configurado en este servidor.";
  }
  if (error instanceof ApiError) return error.message || "No pudimos subir la foto.";
  return "No pudimos conectar con el servidor. Revisa tu conexión.";
}

export function ReceiptImportDialog({ onClose }: { onClose: () => void }) {
  const [receiptId, setReceiptId] = useState<string | null>(null);
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

        {!receiptId ? (
          <CaptureStep uploading={upload.isPending} error={upload.error} onSelect={onFileSelected} />
        ) : receipt && !isReceiptPending(receipt.status) ? (
          receipt.status === "failed" ? (
            <FailedStep
              receipt={receipt}
              onRetry={() => setReceiptId(null)}
              onDiscard={discardAndClose}
            />
          ) : (
            <ReadyStep receipt={receipt} onDiscard={discardAndClose} />
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

function ReadyStep({ receipt, onDiscard }: { receipt: ReceiptImport; onDiscard: () => void }) {
  const draft = receipt.draft;
  const amount = typeof draft?.amount.value === "number" ? draft.amount.value : null;
  const currency = typeof draft?.currency.value === "string" ? draft.currency.value : "EUR";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        Esto es lo que Saldo detectó. La revisión completa (edición y confirmación) llega en la
        siguiente etapa — por ahora puedes descartarlo.
      </p>

      {draft && draft.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-coral-soft px-3 py-2 text-xs text-coral">
          {draft.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-ink-soft">Comercio</dt>
        <dd>{draft?.merchant.rawText || draft?.merchant.suggestedName || "—"}</dd>
        <dt className="text-ink-soft">Importe</dt>
        <dd>{amount != null ? formatMoney(amount, currency) : "—"}</dd>
        <dt className="text-ink-soft">Fecha</dt>
        <dd>{typeof draft?.date.value === "string" ? draft.date.value : "—"}</dd>
        <dt className="text-ink-soft">Confianza global</dt>
        <dd>{draft ? `${Math.round(draft.overallConfidence * 100)}%` : "—"}</dd>
      </dl>

      <details className="text-xs text-ink-soft">
        <summary className="cursor-pointer select-none">Ver datos completos</summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-paper p-3 text-[11px]">
          {JSON.stringify(draft, null, 2)}
        </pre>
      </details>

      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-xl border border-line px-4 py-2 text-sm"
          onClick={onDiscard}
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
