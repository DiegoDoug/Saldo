/** App shell for the budgeting views: sticky header (brand, year switch,
 * logout) and a bottom nav, with the active view rendered via <Outlet />. */

import {
  BarChart3,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Home,
  Landmark,
  LogOut,
  PiggyBank,
  Receipt,
  Store,
  Target,
} from "lucide-react";
import { useEffect } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { useLayout } from "../dashboard/layoutRepo";
import { useLogout } from "../identity/hooks";
import { PwaUpdatePrompt } from "../sync/PwaUpdatePrompt";
import { SyncStatusBar } from "../sync/SyncStatusBar";
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

      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-center gap-1 overflow-x-auto border-t border-line bg-card/95 p-2 backdrop-blur">
        <BottomLink to="/" icon={<Home size={20} />} label="Inicio" end />
        <BottomLink to="/transactions" icon={<Receipt size={20} />} label="Movimientos" />
        <BottomLink to="/accounts" icon={<Landmark size={20} />} label="Cuentas" />
        <BottomLink to="/bills" icon={<CalendarClock size={20} />} label="Recibos" />
        <BottomLink to="/goals" icon={<Target size={20} />} label="Metas" />
        <BottomLink to="/merchants" icon={<Store size={20} />} label="Comercios" />
        <BottomLink to="/year" icon={<BarChart3 size={20} />} label="Año" />
      </nav>
    </div>
  );
}

function BottomLink({
  to,
  icon,
  label,
  end,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
          isActive ? "bg-mint-soft/60 text-mint" : "text-ink-soft"
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
