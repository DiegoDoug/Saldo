import { Loader2, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { TextField } from "../../shared/ui/TextField";
import { transportOr } from "./authErrors";
import { useForgotPassword } from "./hooks";
import { validateEmail } from "./validation";

/**
 * Modal dialog to request a password-reset email. Opened from the login screen.
 *
 * The response is intentionally non-committal: the backend answers the same
 * whether or not the email is registered (to avoid account enumeration), so on
 * success we show a neutral "if that account exists, we sent a link" message
 * rather than confirming the address exists.
 */
export function ForgotPasswordDialog({
  initialEmail = "",
  onClose,
}: {
  initialEmail?: string;
  onClose: () => void;
}) {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const emailError = validateEmail(email);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (emailError || forgot.isPending) return;
    forgot.mutate({ email });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="card-panel auth-card-enter w-full max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-title"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="forgot-title" className="font-display text-xl font-semibold tracking-tight">
            Recupera tu contraseña
          </h2>
          <button
            type="button"
            className="rounded-lg p-1 text-ink-soft hover:bg-mint-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-soft"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {forgot.isSuccess ? (
          <div className="flex flex-col gap-4">
            <p className="rounded-xl bg-mint-soft px-3 py-2 text-sm font-medium text-mint" role="status">
              Si ese correo tiene una cuenta, te enviamos un enlace para
              restablecer la contraseña. Revisa tu bandeja de entrada.
            </p>
            <button className="btn-primary w-full" type="button" onClick={onClose}>
              Entendido
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <p className="text-sm text-ink-soft">
              Introduce el correo de tu cuenta y te enviaremos un enlace para
              crear una nueva contraseña.
            </p>
            <TextField
              label="Correo"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              aria-required="true"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              error={touched ? emailError : null}
            />

            {forgot.isError && (
              <p className="rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral" role="alert">
                {transportOr(forgot.error, "No pudimos enviar el correo. Inténtalo de nuevo.")}
              </p>
            )}

            <button className="btn-primary mt-1 w-full" type="submit" disabled={forgot.isPending}>
              {forgot.isPending ? (
                <>
                  <Loader2 className="animate-spin" size={18} aria-hidden="true" />
                  Enviando…
                </>
              ) : (
                "Enviar enlace"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
