import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { PasswordField } from "../../shared/ui/PasswordField";
import { TextField } from "../../shared/ui/TextField";
import { AuthLayout } from "./AuthLayout";
import { loginErrorMessage } from "./authErrors";
import { useLogin } from "./hooks";
import { validateEmail, validatePassword } from "./validation";

interface LoginLocationState {
  justRegistered?: boolean;
  /** Set by callers that redirect here after a token expires (additive). */
  sessionExpired?: boolean;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LoginLocationState | null;
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  const formValid = !emailError && !passwordError;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    // Guard against invalid input and duplicate submissions.
    if (!formValid || login.isPending) return;
    login.mutate({ email, password }, { onSuccess: () => navigate("/") });
  }

  return (
    <AuthLayout
      title="Bienvenido de nuevo"
      subtitle="Inicia sesión para ver tus cuentas."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link
            className="rounded font-semibold text-mint hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-soft"
            to="/register"
          >
            Regístrate
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {state?.justRegistered && !login.isError && (
          <p className="rounded-xl bg-mint-soft px-3 py-2 text-sm font-medium text-mint" role="status">
            Tu cuenta fue creada. Inicia sesión para continuar.
          </p>
        )}
        {state?.sessionExpired && !login.isError && (
          <p className="rounded-xl bg-coral-soft px-3 py-2 text-sm font-medium text-coral" role="status">
            Tu sesión expiró. Vuelve a iniciar sesión.
          </p>
        )}

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
          autoComplete="current-password"
          aria-required="true"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={touched.password ? passwordError : null}
        />

        {login.isError && (
          <p className="rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral" role="alert">
            {loginErrorMessage(login.error)}
          </p>
        )}

        <button className="btn-primary mt-1 w-full" type="submit" disabled={login.isPending}>
          {login.isPending ? (
            <>
              <Loader2 className="animate-spin" size={18} aria-hidden="true" />
              Entrando…
            </>
          ) : (
            "Iniciar sesión"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
