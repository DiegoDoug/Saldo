import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { db } from "./db/db";
import "./index.css";

// Open the local database on first load so IndexedDB exists before any write.
// Failure here is non-fatal (e.g. private-mode restrictions); the app still runs.
db.open().catch((err) => console.error("Failed to open Dexie database", err));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Offline-first: don't hammer the network, retry politely on reconnect.
      staleTime: 1000 * 30,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
