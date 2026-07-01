/** Gate for authenticated routes: redirects to /login when there's no session. */

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuthStore } from "../modules/identity/authStore";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
