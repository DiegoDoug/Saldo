/**
 * Toast that surfaces service-worker lifecycle events: "ready to work offline"
 * on first install, and "new version available → reload" on an update.
 */

import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm shadow-lg">
      <span className="flex-1">
        {needRefresh ? "Hay una nueva versión de Saldo." : "Saldo está listo para usarse sin conexión."}
      </span>
      {needRefresh && (
        <button
          className="rounded-lg bg-mint px-3 py-1.5 text-xs font-semibold text-white"
          onClick={() => void updateServiceWorker(true)}
        >
          Actualizar
        </button>
      )}
      <button className="text-ink-soft hover:text-ink" aria-label="Cerrar" onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}
