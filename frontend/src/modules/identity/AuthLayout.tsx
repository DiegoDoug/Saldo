/** Shared framing for the login/register screens (Cuaderno styling). */

import { PiggyBank } from "lucide-react";
import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="auth-card-enter w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-white">
            <PiggyBank size={22} aria-hidden="true" />
          </span>
          <span className="font-display text-2xl font-semibold">
            Saldo<span className="text-coral">.</span>
          </span>
        </div>

        <div className="card-panel">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-6 mt-1.5 text-sm text-ink-soft">{subtitle}</p>
          {children}
        </div>

        <p className="mt-5 text-center text-sm text-ink-soft">{footer}</p>
      </div>
    </main>
  );
}
