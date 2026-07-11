/**
 * File picker / drop zone for a bank-statement file (CSV or Markdown).
 * Mirrors `receipt-import/ReceiptDropZone.tsx`, but validates text formats
 * instead of images. Client-side type/size checks are a UX nicety for instant
 * feedback; the backend re-validates regardless (it is the real limit).
 */

import { FileUp } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";

// Mirrors the backend's `storage.ALLOWED_MIME_TYPES` / `SALDO_BANK_MAX_UPLOAD_MB`
// for early feedback only — the backend is the actual limit. Some browsers
// report an empty type for `.md`/`.csv`, so we also accept by extension.
const ALLOWED_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/markdown",
  "text/x-markdown",
  "text/plain",
];
const ALLOWED_EXTENSIONS = [".csv", ".md", ".markdown", ".txt"];
const MAX_BYTES = 10 * 1024 * 1024;

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function BankDropZone({ onSelect }: { onSelect: (file: File) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function validateAndSelect(file: File) {
    if (!ALLOWED_TYPES.includes(file.type) && !hasAllowedExtension(file.name)) {
      setError("Formato no admitido. Usa un archivo CSV o Markdown de tu banco.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El archivo pesa demasiado (máximo 10 MB).");
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
        <FileUp size={28} className="text-ink-soft" aria-hidden="true" />
        <p className="text-sm font-medium">
          Arrastra el archivo de tu banco o haz clic para elegirlo
        </p>
        <p className="text-xs text-ink-soft">CSV o Markdown · máximo 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.md,.markdown,.txt,text/csv,text/markdown,text/plain"
          className="hidden"
          aria-label="Elegir archivo del banco"
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
