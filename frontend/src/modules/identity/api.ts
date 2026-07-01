/**
 * Identity API calls against the fastapi-users endpoints.
 * Kept framework-free (no React) so they can be reused and tested directly.
 */

import { apiRequest } from "../../shared/api/client";
import { db } from "../../db/db";
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

export async function register(email: string, password: string): Promise<SessionUser> {
  const user = await apiRequest<UserResponse>("/auth/register", {
    method: "POST",
    json: { email, password },
    auth: false,
  });
  return toSessionUser(user);
}

export async function login(email: string, password: string): Promise<string> {
  const token = await apiRequest<TokenResponse>("/auth/jwt/login", {
    method: "POST",
    form: { username: email, password },
    auth: false,
  });
  return token.access_token;
}

/** Fetch the current user (requires a valid token in the auth store). */
export async function fetchMe(): Promise<SessionUser> {
  const user = await apiRequest<UserResponse>("/users/me");
  const session = toSessionUser(user);
  // Mirror the profile into Dexie so the app has the User shape offline.
  await db.profile.put({
    id: session.id,
    email: session.email,
    defaultCurrency: session.defaultCurrency,
  });
  return session;
}
