/**
 * Maps auth failures into user-facing Spanish messages.
 *
 * The backend (fastapi-users) reports the real reason via `ApiError` — either a
 * string `detail` code (e.g. "REGISTER_USER_ALREADY_EXISTS") or an object
 * `{ code, reason }` for password validation. The old UI ignored all of this
 * and always guessed "maybe the email already exists", which hid genuine
 * failures (validation, server errors, network). These helpers surface the
 * actual cause instead.
 */

import { ApiError } from "../../shared/api/client";

interface Detail {
  code?: string;
  reason?: string;
}

/** Pull the fastapi-users error code/reason out of an ApiError body. */
function detailOf(error: unknown): Detail {
  if (!(error instanceof ApiError)) return {};
  const body = error.body;
  if (!body || typeof body !== "object" || !("detail" in body)) return {};

  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return { code: detail };
  if (detail && typeof detail === "object") {
    const d = detail as { code?: unknown; reason?: unknown };
    return {
      code: typeof d.code === "string" ? d.code : undefined,
      reason: typeof d.reason === "string" ? d.reason : undefined,
    };
  }
  return {};
}

/** Shared fallbacks for transport-level failures (no ApiError / 5xx). */
function transportMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    // fetch rejected before a response — network / server unreachable.
    return "No pudimos conectar con el servidor. Revisa tu conexión.";
  }
  if (error.status >= 500) {
    return "El servidor tuvo un problema. Inténtalo de nuevo más tarde.";
  }
  return null;
}

export function registerErrorMessage(error: unknown): string {
  const transport = transportMessage(error);
  if (transport) return transport;

  const { code, reason } = detailOf(error);
  switch (code) {
    case "REGISTER_USER_ALREADY_EXISTS":
      return "Ese correo ya está registrado. Inicia sesión en su lugar.";
    case "REGISTER_INVALID_PASSWORD":
      return reason
        ? `Contraseña no válida: ${reason}`
        : "La contraseña no cumple los requisitos.";
    default:
      if (error instanceof ApiError && error.status === 422) {
        return "Revisa que el correo y la contraseña sean válidos.";
      }
      return "No pudimos crear la cuenta. Inténtalo de nuevo.";
  }
}

/**
 * Return a transport-level message (network / 5xx) if applicable, otherwise the
 * provided fallback. Used where there is no meaningful field-level error code —
 * e.g. forgot-password, which answers the same regardless of the account.
 */
export function transportOr(error: unknown, fallback: string): string {
  return transportMessage(error) ?? fallback;
}

export function resetPasswordErrorMessage(error: unknown): string {
  const transport = transportMessage(error);
  if (transport) return transport;

  const { code, reason } = detailOf(error);
  switch (code) {
    case "RESET_PASSWORD_BAD_TOKEN":
      return "El enlace no es válido o ya caducó. Solicita uno nuevo.";
    case "RESET_PASSWORD_INVALID_PASSWORD":
      return reason
        ? `Contraseña no válida: ${reason}`
        : "La contraseña no cumple los requisitos.";
    default:
      return "No pudimos restablecer la contraseña. Inténtalo de nuevo.";
  }
}

export function loginErrorMessage(error: unknown): string {
  const transport = transportMessage(error);
  if (transport) return transport;

  const { code } = detailOf(error);
  switch (code) {
    case "LOGIN_BAD_CREDENTIALS":
      return "Correo o contraseña incorrectos.";
    case "LOGIN_USER_NOT_VERIFIED":
      return "Debes verificar tu cuenta antes de iniciar sesión.";
    default:
      return "No pudimos iniciar sesión. Revisa tus datos.";
  }
}
