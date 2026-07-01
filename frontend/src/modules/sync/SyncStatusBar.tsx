/**
 * Surfaces two sync conditions to the user:
 *  - offline: reassures that edits are saved locally and will sync on reconnect.
 *  - conflicts: when the server overwrote local changes (last-write-wins), tells
 *    the user how many records changed under them, with a dismiss.
 */

import { CloudOff, Info } from "lucide-react";

import { useSyncStore } from "./syncStore";

export function SyncStatusBar() {
  const status = useSyncStore((s) => s.status);
  const conflicts = useSyncStore((s) => s.conflicts);
  const clearConflicts = useSyncStore((s) => s.clearConflicts);

  if (status !== "offline" && conflicts === 0) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-3">
      {status === "offline" && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink">
          <CloudOff size={16} className="text-gold" />
          Sin conexión — tus cambios se guardan y se sincronizarán al reconectar.
        </div>
      )}
      {conflicts > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-blue/30 bg-blue/10 px-3 py-2 text-sm text-ink">
          <Info size={16} className="text-blue" />
          <span className="flex-1">
            {conflicts} {conflicts === 1 ? "cambio se actualizó" : "cambios se actualizaron"} desde
            otro dispositivo.
          </span>
          <button className="text-xs font-semibold text-blue" onClick={clearConflicts}>
            Entendido
          </button>
        </div>
      )}
    </div>
  );
}
