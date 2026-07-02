/** App shell for the budgeting views: sticky header (brand, year switch,
 * logout) and a bottom nav, with the active view rendered via <Outlet />. */

import { ChevronLeft, ChevronRight, LogOut, PiggyBank } from "lucide-react";
import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";

import { useLayout } from "../dashboard/layoutRepo";
import { useLogout } from "../identity/hooks";
import { PwaUpdatePrompt } from "../sync/PwaUpdatePrompt";
import { SyncStatusBar } from "../sync/SyncStatusBar";
import { AppNav } from "./AppNav";
import { useBudgetingUi } from "./uiStore";

export function BudgetingLayout() {
  const year = useBudgetingUi((s) => s.currentYear);
  const stepYear = useBudgetingUi((s) => s.stepYear);
  const logout = useLogout();
  const theme = useLayout().theme;

  // Apply the user's theme app-wide via a data attribute (see index.css).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 p-3">
          <Link to="/" className="flex items-center gap-2" aria-label="Inicio">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-mint text-white">
              <PiggyBank size={18} />
            </span>
            <span className="font-display text-xl font-semibold">
              Saldo<span className="text-coral">.</span>
            </span>
          </Link>

          <div
            className="ml-auto flex items-center gap-1 rounded-xl border border-line bg-card p-1"
            role="group"
            aria-label="Cambiar año"
          >
            <button
              className="grid place-items-center rounded-lg p-1.5 text-ink-soft hover:bg-paper"
              onClick={() => stepYear(-1)}
              aria-label="Año anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[3rem] text-center font-display font-semibold">{year}</span>
            <button
              className="grid place-items-center rounded-lg p-1.5 text-ink-soft hover:bg-paper"
              onClick={() => stepYear(1)}
              aria-label="Año siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-card text-ink-soft hover:text-coral"
            onClick={logout}
            aria-label="Salir"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <SyncStatusBar />

      <main className="mx-auto max-w-3xl p-4">
        <Outlet />
      </main>

      <PwaUpdatePrompt />

      <AppNav />
    </div>
  );
}
