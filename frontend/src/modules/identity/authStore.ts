/**
 * Auth session as a small Zustand store, persisted to localStorage so the
 * session survives a reload (Stage 6 exit criterion). Only the session and,
 * later, the active theme live in global state — everything else is server
 * state (TanStack Query) or local data (Dexie).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SessionUser {
  id: string;
  email: string;
  defaultCurrency: string;
}

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  /** Set when a request came back 401 outside the login flow (expired/invalid
   * token) so the login screen can explain why it kicked the user out. Not
   * persisted -- it's only relevant for the redirect that follows. */
  sessionExpired: boolean;
  setSession: (token: string, user: SessionUser) => void;
  setToken: (token: string) => void;
  setUser: (user: SessionUser) => void;
  clear: () => void;
  /** Clears the session and flags it as expired (vs. a deliberate logout). */
  expireSession: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      sessionExpired: false,
      setSession: (token, user) => set({ token, user, sessionExpired: false }),
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null, sessionExpired: false }),
      expireSession: () => set({ token: null, user: null, sessionExpired: true }),
      isAuthenticated: () => Boolean(get().token),
    }),
    { name: "saldo-auth", partialize: (state) => ({ token: state.token, user: state.user }) },
  ),
);
