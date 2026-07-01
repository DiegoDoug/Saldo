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
  setSession: (token: string, user: SessionUser) => void;
  setToken: (token: string) => void;
  setUser: (user: SessionUser) => void;
  clear: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
      isAuthenticated: () => Boolean(get().token),
    }),
    { name: "saldo-auth" },
  ),
);
