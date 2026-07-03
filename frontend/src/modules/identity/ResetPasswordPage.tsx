import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { PasswordField } from "../../shared/ui/PasswordField";
import { AuthLayout } from "./AuthLayout";
import { resetPasswordErrorMessage } from "./authErrors";
import { useResetPassword } from "./hooks";
import { MIN_PASSWORD_LENGTH, validatePassword } from "./validation";

/**
 * Landing page for the link in the recovery email (`/reset-password?token=...`).
 * Because the link is a fresh page load it must be a full route, not the modal.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const reset = useResetPassword();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({ password: false, confirm: false });

  const passwordError = validatePassword(password, { min: MIN_PASSWORD_LENGTH });
  const confirmError = confirm !== password ? "Las contraseñas no coinciden." : null;
  const formValid = !passwordError && !confirmError;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    if (!formValid || reset.isPending) return;
    reset.mutate(
      { token, password },
      { onSuccess: () => navigate("/login", { state: { passwordReset: true } }) },
    );
  }

  const footer = (
    <Link
      className="rounded font-semibold text-mint hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-soft"
      to="/login"
    >
      Volver a iniciar sesión
    </Link>
  );

  if (!token) {
    return (
      <AuthLayout
        title="Enlace no válido"
        subtitle="Falta el token de recuperación."
        footer={footer}
      >
        <p className="rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral" role="alert">
          Este enlace está incompleto o caducó. Solicita uno nuevo desde la
          pantalla de inicio de sesión.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Nueva contraseña"
      subtitle="Elige una contraseña para tu cuenta."
      footer={footer}
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <PasswordField
          label="Nueva contraseña"
          autoComplete="new-password"
          aria-required="true"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={touched.password ? passwordError : null}
        />
        <PasswordField
          label="Confirma la contraseña"
          autoComplete="new-password"
          aria-required="true"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={touched.confirm ? confirmError : null}
        />

        {reset.isError && (
          <p className="rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral" role="alert">
            {resetPasswordErrorMessage(reset.error)}
          </p>
        )}

        <button className="btn-primary mt-1 w-full" type="submit" disabled={reset.isPending}>
          {reset.isPending ? (
            <>
              <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              Guardando…
            </>
          ) : (
            "Restablecer contraseña"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
