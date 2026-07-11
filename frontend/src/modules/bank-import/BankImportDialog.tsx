/**
 * Import-bank-file dialog: capture -> uploading -> processing (progress bar) ->
 * ready|failed -> confirmed.
 *
 * Reuses the receipt dialog's modal shell and state-machine pattern
 * (`receipt-import/ReceiptImportDialog.tsx`) — this is a dialog over the
 * transactions list, not its own route. The "processing" step shows a
 * determinate progress bar with a live percentage (`ProgressBar` +
 * `useFakeProgress`) instead of a bare spinner, because the AI parse of a whole
 * statement takes real, variable time and a moving bar keeps the user waiting.
 *
 * The "ready" step renders the editable `BankReviewForm` — the pipeline only
 * ever produces a draft; the form is what actually writes the `movimientos`
 * (and any new `cuentas`/`categorias`/`comercios`/`etiquetas`), and only once
 * the user confirms.
 */

import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "../../shared/api/client";
import { type BankImport, isBankImportPending } from "./api";
import { BankDropZone } from "./BankDropZone";
import { BankReviewForm } from "./BankReviewForm";
import { useBankImport, useDiscardBankImport, useUploadBankFile } from "./hooks";
import { ProgressBar } from "./ProgressBar";
import { useFakeProgress } from "./useFakeProgress";

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return "La importación bancaria no está configurada en este servidor.";
  }
  if (error instanceof ApiError) return error.message || "No pudimos subir el archivo.";
  return "No pudimos conectar con el servidor. Revisa tu conexión.";
}

export function BankImportDialog({ onClose }: { onClose: () => void }) {
  const [importId, setImportId] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  const upload = useUploadBankFile();
  const discard = useDiscardBankImport();
  const importQuery = useBankImport(importId);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onFileSelected(file: File) {
    upload.mutate(file, { onSuccess: (imp) => setImportId(imp.id) });
  }

  function discardAndClose() {
    if (importId) discard.mutate(importId);
    onClose();
  }

  const bankImport = importQuery.data;
  const processing = !!importId && (upload.isPending || !bankImport || isBankImportPending(bankImport.status));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card-panel auth-card-enter w-full max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-import-title"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="bank-import-title" className="font-display text-xl font-semibold tracking-tight">
            Importar del banco
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

        {confirmedCount !== null ? (
          <ConfirmedStep count={confirmedCount} onClose={onClose} />
        ) : !importId ? (
          <CaptureStep uploading={upload.isPending} error={upload.error} onSelect={onFileSelected} />
        ) : bankImport && !isBankImportPending(bankImport.status) ? (
          bankImport.status === "failed" ? (
            <FailedStep
              bankImport={bankImport}
              onRetry={() => setImportId(null)}
              onDiscard={discardAndClose}
            />
          ) : bankImport.draft ? (
            <BankReviewForm
              bankImport={bankImport}
              draft={bankImport.draft}
              onConfirmed={setConfirmedCount}
              onDiscard={discardAndClose}
            />
          ) : (
            <FailedStep
              bankImport={{ ...bankImport, errorMessage: "El extracto no tiene datos analizados." }}
              onRetry={() => setImportId(null)}
              onDiscard={discardAndClose}
            />
          )
        ) : (
          <ProcessingStep active={processing} />
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
  if (uploading) return <ProcessingStep active label="Subiendo el archivo…" />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Sube el CSV o Markdown de tu banco y Saldo propondrá los movimientos, cuentas y categorías
        por ti.
      </p>
      {error != null && (
        <p className="rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral" role="alert">
          {uploadErrorMessage(error)}
        </p>
      )}
      <BankDropZone onSelect={onSelect} />
    </div>
  );
}

function ProcessingStep({ active = true, label }: { active?: boolean; label?: string }) {
  const percent = useFakeProgress(active, false);
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-center gap-2 text-sm text-ink-soft">
        <Loader2 className="animate-spin text-mint" size={20} aria-hidden="true" />
        {label ?? "La IA está leyendo tu extracto…"}
      </div>
      <ProgressBar percent={percent} label={label} />
    </div>
  );
}

function FailedStep({
  bankImport,
  onRetry,
  onDiscard,
}: {
  bankImport: BankImport;
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
        {bankImport.errorMessage || "No pudimos analizar el extracto."}
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

function ConfirmedStep({ count, onClose }: { count: number; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl bg-mint-soft px-3 py-2 text-sm font-medium text-mint" role="status">
        {count} movimientos guardados. Se sincronizarán automáticamente.
      </p>
      <button className="btn-primary w-full" type="button" onClick={onClose}>
        Entendido
      </button>
    </div>
  );
}
