/**
 * Lightweight, client-side field validation for the auth forms. This is a UX
 * convenience only — the backend (fastapi-users) remains the source of truth
 * and its errors are surfaced via authErrors.ts.
 */

/** Pragmatic email shape check (not RFC-exhaustive, just catches typos). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimum password length enforced by the backend user manager. */
export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | null {
  if (!email.trim()) return "Introduce tu correo.";
  if (!EMAIL_RE.test(email)) return "Introduce un correo válido.";
  return null;
}

export function validatePassword(password: string, { min }: { min?: number } = {}): string | null {
  if (!password) return "Introduce tu contraseña.";
  if (min && password.length < min) return `Usa al menos ${min} caracteres.`;
  return null;
}
