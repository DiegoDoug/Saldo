import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { db } from "./db/db";
import { queryClient } from "./shared/queryClient";
import "./index.css";

// Open the local database on first load so IndexedDB exists before any write.
// Failure here is non-fatal (e.g. private-mode restrictions); the app still runs.
db.open().catch((err) => console.error("Failed to open Dexie database", err));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
