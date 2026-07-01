import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthLayout } from "./AuthLayout";
import { useRegister } from "./hooks";

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    registerMutation.mutate({ email, password }, { onSuccess: () => navigate("/") });
  }

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Tu presupuesto, en tu propio servidor."
      footer={
        <>
          ¿Ya tienes cuenta? <Link className="font-semibold text-mint" to="/login">Inicia sesión</Link>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {registerMutation.isError && (
          <p className="text-sm text-coral" role="alert">
            No pudimos crear la cuenta. ¿Ese correo ya existe?
          </p>
        )}

        <button className="btn-primary mt-2" type="submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? "Creando…" : "Crear cuenta"}
        </button>
      </form>
    </AuthLayout>
  );
}
