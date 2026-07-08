import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../../modules/identity/authStore";
import { apiRequest, ApiError } from "./client";

describe("apiRequest", () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops the session on a 401 from an authenticated request", async () => {
    useAuthStore.getState().setSession("stale-token", {
      id: "u1",
      email: "ana@example.com",
      defaultCurrency: "EUR",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }),
      ),
    );

    await expect(apiRequest("/layout")).rejects.toBeInstanceOf(ApiError);

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().sessionExpired).toBe(true);
  });

  it("does not touch the session on a 401 from an unauthenticated (auth: false) request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "LOGIN_BAD_CREDENTIALS" }), { status: 400 }),
      ),
    );

    await expect(
      apiRequest("/auth/jwt/login", { method: "POST", form: { username: "a", password: "b" }, auth: false }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });
});
