/**
 * Bottom navigation, grouped into a few pills. A "link" pill navigates directly;
 * a "group" pill opens a popover listing its destinations. Grouping keeps the
 * bar to four thumb-friendly targets on mobile as the app grows.
 *
 * Accessibility: group buttons expose aria-haspopup/aria-expanded and control a
 * role="menu" popover of role="menuitem" links. The popover closes on outside
 * click, Escape, or navigation.
 */

import {
  BarChart3,
  CalendarClock,
  Home,
  Landmark,
  type LucideIcon,
  Receipt,
  Scale,
  Store,
  Target,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

type NavEntry =
  | { kind: "link"; item: NavItem }
  | { kind: "group"; id: string; label: string; icon: LucideIcon; items: NavItem[] };

// Four bottom-bar entries: one direct link + three grouped popovers.
const NAV: NavEntry[] = [
  { kind: "link", item: { to: "/", label: "Inicio", icon: Home, end: true } },
  {
    kind: "group",
    id: "money",
    label: "Dinero",
    icon: Wallet,
    items: [
      { to: "/transactions", label: "Movimientos", icon: Receipt },
      { to: "/accounts", label: "Cuentas", icon: Landmark },
      { to: "/bills", label: "Recibos", icon: CalendarClock },
      { to: "/merchants", label: "Comercios", icon: Store },
    ],
  },
  {
    kind: "group",
    id: "wealth",
    label: "Objetivos",
    icon: Target,
    items: [
      { to: "/goals", label: "Metas", icon: Target },
      { to: "/net-worth", label: "Patrimonio", icon: Scale },
    ],
  },
  {
    kind: "group",
    id: "insights",
    label: "Análisis",
    icon: BarChart3,
    items: [
      { to: "/reports", label: "Informes", icon: BarChart3 },
      { to: "/year", label: "Año", icon: BarChart3 },
    ],
  },
];

export function AppNav() {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);

  // Close the popover on navigation.
  useEffect(() => setOpenGroup(null), [location.pathname]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!openGroup) return;
    function onPointer(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenGroup(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openGroup]);

  return (
    <nav
      ref={navRef}
      className="fixed inset-x-0 bottom-0 z-20 flex justify-center gap-2 border-t border-line bg-card/95 p-2 backdrop-blur"
    >
      {NAV.map((entry) =>
        entry.kind === "link" ? (
          <PillLink key={entry.item.to} item={entry.item} />
        ) : (
          <GroupPill
            key={entry.id}
            label={entry.label}
            icon={entry.icon}
            items={entry.items}
            open={openGroup === entry.id}
            active={entry.items.some((i) => location.pathname === i.to)}
            onToggle={() => setOpenGroup((cur) => (cur === entry.id ? null : entry.id))}
          />
        ),
      )}
    </nav>
  );
}

const pillClass = (active: boolean) =>
  `flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-xs font-semibold transition ${
    active ? "bg-mint-soft/60 text-mint" : "text-ink-soft"
  }`;

function PillLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => pillClass(isActive)}>
      <Icon size={20} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function GroupPill({
  label,
  icon: Icon,
  items,
  open,
  active,
  onToggle,
}: {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  open: boolean;
  active: boolean;
  onToggle: () => void;
}) {
  const menuId = `nav-group-${label}`;
  return (
    <div className="relative">
      <button
        type="button"
        className={pillClass(active || open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={onToggle}
      >
        <Icon size={20} />
        <span>{label}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute bottom-full left-1/2 mb-2 flex w-44 -translate-x-1/2 flex-col gap-1 rounded-2xl border border-line bg-card p-2 shadow-lg"
        >
          {items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                role="menuitem"
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    isActive ? "bg-mint-soft/60 text-mint" : "text-ink hover:bg-paper"
                  }`
                }
              >
                <ItemIcon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
