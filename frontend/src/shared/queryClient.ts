/**
 * The single shared TanStack Query client, extracted out of main.tsx so
 * non-component code (the login/register/logout flow) can clear cached
 * queries when a different account signs in on the same browser.
 */

import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./api/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Offline-first: don't hammer the network, retry politely on reconnect.
      staleTime: 1000 * 30,
      // A 401 means the token is dead -- expireSession() already fired and
      // retrying just wastes round trips against a request that can't succeed.
      retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status === 401),
      refetchOnWindowFocus: false,
    },
  },
});
