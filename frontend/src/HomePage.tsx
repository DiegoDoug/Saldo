/**
 * Placeholder authenticated home. Stage 7 replaces this with the real
 * Dashboard / MonthView / YearView ported from the prototype. For now it proves
 * the session works: it greets the logged-in user and can log out.
 */

import { LogOut } from "lucide-react";

import { useAuthStore } from "./modules/identity/authStore";
import { useLogout } from "./modules/identity/hooks";

export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <div className="font-display text-2xl font-semibold">
            Saldo<span className="text-coral">.</span>
          </div>
          <p className="text-sm text-ink-soft">Hola, {user?.email}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-ink-soft transition hover:text-coral"
          onClick={logout}
        >
          <LogOut size={16} /> Salir
        </button>
      </header>

      <div className="card-panel">
        <h1 className="font-display text-lg font-semibold">Tu presupuesto llega pronto</h1>
        <p className="mt-1 text-sm text-ink-soft">
          El panel de presupuesto (meses, año, categorías) se construye en la
          siguiente etapa. La sesión, el almacén local y la sincronización ya
          están listos.
        </p>
      </div>
    </div>
  );
}
