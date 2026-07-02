/**
 * Friendly placeholder for screens with no data yet. Centers an icon tile, a
 * title, a short explanation, and an optional call-to-action so a brand-new
 * user is guided toward the first step instead of staring at a wall of zeros.
 */

import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="card-panel flex flex-col items-center gap-3 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-mint-soft text-mint">
        {icon}
      </div>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="max-w-xs text-sm leading-relaxed text-ink-soft">{message}</p>
      {action}
    </div>
  );
}
