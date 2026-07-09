/**
 * Perfil: the signed-in user's account page. Shows who is logged in (email,
 * account id), lets them change their default currency and password, pick the
 * app theme, and sign out. Currency/password changes go straight to the
 * backend (they're account state, not offline data); the theme is Dexie-first
 * like the rest of the layout and syncs via /layout.
 */

import { Check, LogOut, UserCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ApiError } from "../../shared/api/client";
import { PasswordField } from "../../shared/ui/PasswordField";
import { type LayoutData } from "../../db/db";
import { saveLayout, useLayout } from "../dashboard/layoutRepo";
import { runLayoutSync } from "../dashboard/layoutSync";
import { ThemePicker } from "../dashboard/ThemePicker";
import { useAuthStore } from "../identity/authStore";
import { useChangePassword, useLogout, useUpdateCurrency } from "../identity/hooks";
import { transportOr } from "../identity/authErrors";
import { MIN_PASSWORD_LENGTH, validatePassword } from "../identity/validation";

const CURRENCIES = ["EUR", "USD", "MXN", "COP", "ARS", "CLP", "PEN", "DOP", "GBP", "CHF"];

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null; // ProtectedRoute guarantees a session; belt and braces.

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-semibold">Tu perfil</h1>
      <AccountCard email={user.email} id={user.id} />
      <CurrencyCard current={user.defaultCurrency} />
      <ThemeCard />
      <PasswordCard />
      <SessionCard />
    </div>
  );
}

function AccountCard({ email, id }: { email: string; id: string }) {
  return (
    <section className="card-panel flex items-center gap-4">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-mint-soft text-mint">
        <UserCircle2 size={30} />
      </span>
      <div className="min-w-0">
        <h2 className="truncate font-display font-semibold">{email}</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Id de cuenta: <span className="font-mono">{id.slice(0, 8)}…</span>
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Tus datos se guardan en este dispositivo y se sincronizan con tu servidor.
        </p>
      </div>
    </section>
  );
}

function CurrencyCard({ current }: { current: string }) {
  const update = useUpdateCurrency();
  const [currency, setCurrency] = useState(current);
  const options = CURRENCIES.includes(current) ? CURRENCIES : [current, ...CURRENCIES];

  return (
    <section className="card-panel">
      <h2 className="mb-1 font-display font-semibold">Moneda predeterminada</h2>
      <p className="mb-3 text-sm text-ink-soft">
        La moneda con la que se crean tus nuevas cuentas y movimientos.
      </p>
      <div className="flex items-center gap-2">
        <select
          className="field-input w-32"
          aria-label="Moneda predeterminada"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          className="btn-primary"
          disabled={update.isPending || currency === current}
          onClick={() => update.mutate(currency)}
        >
          Guardar
        </button>
        {update.isSuccess && currency === current && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-mint">
            <Check size={14} /> Guardado
          </span>
        )}
      </div>
      {update.isError && (
        <p className="mt-2 text-sm text-coral" role="alert">
          {transportOr(update.error, "No pudimos guardar la moneda. Inténtalo de nuevo.")}
        </p>
      )}
    </section>
  );
}

function ThemeCard() {
  const layout = useLayout();

  async function pick(theme: string) {
    const next: LayoutData = { ...layout, theme };
    await saveLayout(next);
    void runLayoutSync();
  }

  return (
    <section className="card-panel">
      <h2 className="mb-1 font-display font-semibold">Tema</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Elige el aspecto de la aplicación: claro, medio u oscuro.
      </p>
      <ThemePicker value={layout.theme} onSelect={(id) => void pick(id)} />
    </section>
  );
}

function passwordChangeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    const detail = (error.body as { detail?: unknown } | null)?.detail;
    if (detail === "CURRENT_PASSWORD_INCORRECT") return "La contraseña actual no es correcta.";
    return "La nueva contraseña no cumple los requisitos.";
  }
  return transportOr(error, "No pudimos cambiar la contraseña. Inténtalo de nuevo.");
}

function PasswordCard() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const invalid =
      validatePassword(current) ?? validatePassword(next, { min: MIN_PASSWORD_LENGTH });
    if (invalid) return setFieldError(invalid);
    if (next !== confirm) return setFieldError("Las contraseñas nuevas no coinciden.");
    setFieldError(null);
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setConfirm("");
        },
      },
    );
  }

  return (
    <section className="card-panel">
      <h2 className="mb-1 font-display font-semibold">Cambiar contraseña</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Necesitas tu contraseña actual para confirmar el cambio.
      </p>
      <form className="flex max-w-sm flex-col gap-3" onSubmit={onSubmit}>
        <PasswordField
          label="Contraseña actual"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <PasswordField
          label="Nueva contraseña"
          autoComplete="new-password"
          hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres.`}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <PasswordField
          label="Repite la nueva contraseña"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {(fieldError || change.isError) && (
          <p className="text-sm text-coral" role="alert">
            {fieldError ?? passwordChangeError(change.error)}
          </p>
        )}
        {change.isSuccess && !fieldError && (
          <p className="inline-flex items-center gap-1 text-sm font-medium text-mint">
            <Check size={14} /> Contraseña actualizada.
          </p>
        )}
        <button type="submit" className="btn-primary self-start" disabled={change.isPending}>
          {change.isPending ? "Cambiando…" : "Cambiar contraseña"}
        </button>
      </form>
    </section>
  );
}

function SessionCard() {
  const logout = useLogout();

  return (
    <section className="card-panel">
      <h2 className="mb-1 font-display font-semibold">Sesión</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Al cerrar sesión, tus datos permanecen en este dispositivo y se
        sincronizarán la próxima vez que entres con esta cuenta.
      </p>
      <button
        className="inline-flex items-center gap-2 rounded-xl border border-coral bg-coral-soft px-4 py-2.5 font-semibold text-coral transition hover:brightness-105"
        onClick={logout}
      >
        <LogOut size={16} /> Cerrar sesión
      </button>
    </section>
  );
}
