import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { PasswordField } from "../../shared/ui/PasswordField";
import { TextField } from "../../shared/ui/TextField";
import { AuthLayout } from "./AuthLayout";
import { registerErrorMessage } from "./authErrors";
import { PostRegisterLoginError, useRegister } from "./hooks";
import { MIN_PASSWORD_LENGTH, validateEmail, validatePassword } from "./validation";

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password, { min: MIN_PASSWORD_LENGTH });
  const formValid = !emailError && !passwordError;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!formValid || registerMutation.isPending) return;
    registerMutation.mutate(
      { email, password },
      {
        onSuccess: () => navigate("/"),
        onError: (err) => {
          // Account was created; only the auto-login failed. Send them to the
          // login screen instead of claiming the account couldn't be created.
          if (err instanceof PostRegisterLoginError) {
            navigate("/login", { state: { justRegistered: true } });
          }
        },
      },
    );
  }

  const showError =
    registerMutation.isError && !(registerMutation.error instanceof PostRegisterLoginError);

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Tu presupuesto, en tu propio servidor."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link
            className="rounded font-semibold text-mint hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-soft"
            to="/login"
          >
            Inicia sesión
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <TextField
          label="Correo"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          aria-required="true"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={touched.email ? emailError : null}
        />
        <PasswordField
          label="Contraseña"
          autoComplete="new-password"
          aria-required="true"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={touched.password ? passwordError : null}
          hint={`Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`}
        />

        {showError && (
          <p className="rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral" role="alert">
            {registerErrorMessage(registerMutation.error)}
          </p>
        )}

        <button className="btn-primary mt-1 w-full" type="submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? (
            <>
              <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              Creando…
            </>
          ) : (
            "Crear cuenta"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
