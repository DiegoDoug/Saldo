import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AuthLayout } from "./AuthLayout";
import { loginErrorMessage } from "./authErrors";
import { useLogin } from "./hooks";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const justRegistered = (location.state as { justRegistered?: boolean } | null)?.justRegistered;
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate("/") });
  }

  return (
    <AuthLayout
      title="Bienvenido de nuevo"
      subtitle="Inicia sesión para ver tus cuentas."
      footer={
        <>
          ¿No tienes cuenta? <Link className="font-semibold text-mint" to="/register">Regístrate</Link>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        {justRegistered && !login.isError && (
          <p className="text-sm text-mint" role="status">
            Tu cuenta fue creada. Inicia sesión para continuar.
          </p>
        )}
        <label className="text-sm font-medium">
          Correo
          <input
            className="field-input mt-1"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Contraseña
          <input
            className="field-input mt-1"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {login.isError && (
          <p className="text-sm text-coral" role="alert">
            {loginErrorMessage(login.error)}
          </p>
        )}

        <button className="btn-primary mt-2" type="submit" disabled={login.isPending}>
          {login.isPending ? "Entrando…" : "Iniciar sesión"}
        </button>
      </form>
    </AuthLayout>
  );
}
