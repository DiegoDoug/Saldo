import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "./authStore";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    localStorage.clear();
  });

  it("starts unauthenticated", () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it("stores a session and reports authenticated", () => {
    useAuthStore.getState().setSession("jwt-token", {
      id: "u1",
      email: "ana@example.com",
      defaultCurrency: "EUR",
    });
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    expect(useAuthStore.getState().user?.email).toBe("ana@example.com");
  });

  it("persists the session to localStorage (survives reload)", () => {
    useAuthStore.getState().setSession("jwt-token", {
      id: "u1",
      email: "ana@example.com",
      defaultCurrency: "EUR",
    });
    const persisted = localStorage.getItem("saldo-auth");
    expect(persisted).toBeTruthy();
    expect(persisted).toContain("jwt-token");
  });

  it("clears the session", () => {
    useAuthStore.getState().setSession("jwt-token", {
      id: "u1",
      email: "ana@example.com",
      defaultCurrency: "EUR",
    });
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});
