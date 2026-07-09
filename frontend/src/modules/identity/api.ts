/**
 * Identity API calls against the fastapi-users endpoints.
 * Kept framework-free (no React) so they can be reused and tested directly.
 */

import { apiRequest } from "../../shared/api/client";
import type { SessionUser } from "./authStore";

interface UserResponse {
  id: string;
  email: string;
  default_currency: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

function toSessionUser(u: UserResponse): SessionUser {
  return { id: u.id, email: u.email, defaultCurrency: u.default_currency };
}

/** Trim + lowercase, so "Ana@Mail.com " and "ana@mail.com" are one account. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function register(email: string, password: string): Promise<SessionUser> {
  const user = await apiRequest<UserResponse>("/auth/register", {
    method: "POST",
    json: { email: normalizeEmail(email), password },
    auth: false,
  });
  return toSessionUser(user);
}

export async function login(email: string, password: string): Promise<string> {
  const token = await apiRequest<TokenResponse>("/auth/jwt/login", {
    method: "POST",
    form: { username: normalizeEmail(email), password },
    auth: false,
  });
  return token.access_token;
}

/**
 * Request a password-reset email. The backend always answers 202 whether or
 * not the email is registered (non-enumerable by design), so this resolves
 * regardless — the UI shows a neutral confirmation either way.
 */
export async function forgotPassword(email: string): Promise<void> {
  await apiRequest<void>("/auth/forgot-password", {
    method: "POST",
    json: { email },
    auth: false,
  });
}

/** Complete a reset using the token from the emailed link. */
export async function resetPassword(token: string, password: string): Promise<void> {
  await apiRequest<void>("/auth/reset-password", {
    method: "POST",
    json: { token, password },
    auth: false,
  });
}

/**
 * Fetch the current user. During login/register `token` is passed explicitly
 * because the caller deliberately hasn't committed it to the auth store yet
 * (see `hooks.ts`); otherwise it's read from the store as usual.
 */
export async function fetchMe(token?: string): Promise<SessionUser> {
  const user = await apiRequest<UserResponse>("/users/me", token ? { token } : {});
  return toSessionUser(user);
}

/** Update the current user (fastapi-users PATCH /users/me). */
export async function updateMe(patch: { default_currency?: string }): Promise<SessionUser> {
  const user = await apiRequest<UserResponse>("/users/me", { method: "PATCH", json: patch });
  return toSessionUser(user);
}

/**
 * Change the password. The backend verifies `current_password` itself —
 * a 400 with detail "CURRENT_PASSWORD_INCORRECT" means it didn't match.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiRequest<void>("/users/me/change-password", {
    method: "POST",
    json: { current_password: currentPassword, new_password: newPassword },
  });
}
