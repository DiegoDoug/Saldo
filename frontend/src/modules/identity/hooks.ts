/**
 * Auth mutations (login / register) as TanStack Query hooks. They orchestrate
 * the identity API calls and update the auth store; components just call
 * `mutate` and read `isPending` / `error`.
 */

import { useMutation } from "@tanstack/react-query";

import { fetchMe, login, register } from "./api";
import { useAuthStore } from "./authStore";

interface Credentials {
  email: string;
  password: string;
}

/**
 * Thrown when the account was created successfully but the automatic
 * login-after-register step failed. Lets the UI send the user to the login
 * screen instead of falsely claiming account creation failed.
 */
export class PostRegisterLoginError extends Error {
  constructor(public override cause: unknown) {
    super("Account created but automatic login failed");
    this.name = "PostRegisterLoginError";
  }
}

/** Log in, then fetch the profile — token is stored before /users/me is called. */
async function loginAndLoadProfile({ email, password }: Credentials): Promise<void> {
  const token = await login(email, password);
  useAuthStore.getState().setToken(token);
  try {
    const user = await fetchMe();
    useAuthStore.getState().setUser(user);
  } catch (err) {
    useAuthStore.getState().clear();
    throw err;
  }
}

export function useLogin() {
  return useMutation({ mutationFn: loginAndLoadProfile });
}

export function useRegister() {
  return useMutation({
    mutationFn: async ({ email, password }: Credentials) => {
      await register(email, password);
      // Registration doesn't return a token, so log in immediately after.
      // Keep this failure distinct: the account already exists at this point,
      // so surfacing it as a creation failure would be wrong (and would make
      // a retry hit a genuine "email already exists" conflict).
      try {
        await loginAndLoadProfile({ email, password });
      } catch (err) {
        throw new PostRegisterLoginError(err);
      }
    },
  });
}

export function useLogout() {
  return () => useAuthStore.getState().clear();
}
