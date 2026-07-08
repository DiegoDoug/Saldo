/**
 * Thin fetch wrapper around the backend API.
 *
 * - Base URL comes from VITE_API_BASE_URL (defaults to `/api`, which nginx
 *   proxies to the backend in the Docker setup; dev uses the full origin).
 * - The JWT from the auth store is attached automatically.
 * - Non-2xx responses throw `ApiError` carrying the status and parsed body.
 */

import { useAuthStore } from "../../modules/identity/authStore";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: string;
  /** JSON body (serialized automatically). */
  json?: unknown;
  /** Form-urlencoded body (for the OAuth2 login endpoint). */
  form?: Record<string, string>;
  headers?: Record<string, string>;
  auth?: boolean; // attach the JWT (default true)
  /**
   * Explicit token to attach instead of the auth store's. Used only by the
   * login flow, which fetches the profile before committing the token to
   * the store (see identity/hooks.ts) -- `auth` still governs whether this
   * is treated as an authenticated request (e.g. for 401 handling).
   */
  token?: string;
}

/**
 * The token we sent was rejected (expired, or the account no longer exists)
 * -- drop the session so ProtectedRoute bounces to /login instead of leaving
 * the UI stuck showing stale, unsyncable data. Guarded so a burst of
 * parallel 401s (several in-flight queries sharing one stale token) only
 * touches the store once.
 */
function handleUnauthorized(): void {
  if (useAuthStore.getState().token) {
    useAuthStore.getState().expireSession();
  }
}

function errorDetail(parsed: unknown, fallback: string): string {
  return (
    (parsed && typeof parsed === "object" && "detail" in parsed
      ? String((parsed as { detail: unknown }).detail)
      : fallback) || "Request failed"
  );
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", json, form, headers = {}, auth = true, token: explicitToken } = options;

  const finalHeaders: Record<string, string> = { ...headers };
  let body: BodyInit | undefined;

  if (json !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    finalHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }

  if (auth) {
    const token = explicitToken ?? useAuthStore.getState().token;
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const resp = await fetch(`${BASE_URL}${path}`, { method, headers: finalHeaders, body });

  const text = await resp.text();
  const parsed = text ? safeJson(text) : null;

  if (!resp.ok) {
    if (resp.status === 401 && auth) handleUnauthorized();
    throw new ApiError(resp.status, parsed, errorDetail(parsed, resp.statusText));
  }

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Multipart upload variant of `apiRequest`, for endpoints that take a file
 * (currently just receipt-import). Kept separate rather than folding into
 * `RequestOptions`: `apiRequest` always sets `Content-Type` itself, but a
 * `FormData` body needs the browser to set it (with the multipart boundary),
 * so this deliberately never touches that header.
 */
export async function apiUploadRequest<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  const token = useAuthStore.getState().token;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData });

  const text = await resp.text();
  const parsed = text ? safeJson(text) : null;

  if (!resp.ok) {
    if (resp.status === 401) handleUnauthorized();
    throw new ApiError(resp.status, parsed, errorDetail(parsed, resp.statusText));
  }

  return parsed as T;
}
