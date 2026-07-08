/**
 * File picker / drop zone for a receipt photo — the first file-upload UI in
 * this app (see docs/receipt-import/01-architecture-review.md §2). Validates
 * type/size client-side so the user gets instant feedback instead of a round
 * trip to the backend for something obviously wrong; the backend re-validates
 * regardless (this is a UX nicety, not the security boundary).
 */

import { ImageUp } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";

// Mirrors the backend's defaults (`storage.ALLOWED_MIME_TYPES`,
// `SALDO_RECEIPT_MAX_UPLOAD_MB`) for early feedback only — the backend is the
// actual limit.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 10 * 1024 * 1024;

export function ReceiptDropZone({ onSelect }: { onSelect: (file: File) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function validateAndSelect(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no admitido. Usa una foto JPEG, PNG, WEBP o HEIC.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("La imagen pesa demasiado (máximo 10 MB).");
      return;
    }
    setError(null);
    onSelect(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSelect(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-mint bg-mint-soft/40" : "border-line"
        }`}
      >
        <ImageUp size={28} className="text-ink-soft" aria-hidden="true" />
        <p className="text-sm font-medium">Arrastra una foto del recibo o haz clic para elegirla</p>
        <p className="text-xs text-ink-soft">JPEG, PNG, WEBP o HEIC · máximo 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Elegir foto del recibo"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) validateAndSelect(file);
            e.target.value = ""; // allow re-selecting the same file after an error
          }}
        />
      </div>
      {error && (
        <p className="rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
