import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "./api";
import { ResetPasswordPage } from "./ResetPasswordPage";

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<div>login screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ResetPasswordPage", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("shows an invalid-link message when the token is missing", () => {
    renderAt("/reset-password");
    expect(screen.getByText(/enlace está incompleto o caducó/i)).toBeInTheDocument();
  });

  it("blocks submission when the two passwords do not match", async () => {
    const spy = vi.spyOn(api, "resetPassword").mockResolvedValue(undefined);
    renderAt("/reset-password?token=abc");

    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "a-strong-passphrase" },
    });
    fireEvent.change(screen.getByLabelText("Confirma la contraseña"), {
      target: { value: "different-passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restablecer contraseña/i }));

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("submits the token and password, then redirects to login", async () => {
    const spy = vi.spyOn(api, "resetPassword").mockResolvedValue(undefined);
    renderAt("/reset-password?token=tok-123");

    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "a-strong-passphrase" },
    });
    fireEvent.change(screen.getByLabelText("Confirma la contraseña"), {
      target: { value: "a-strong-passphrase" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restablecer contraseña/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("tok-123", "a-strong-passphrase"));
    expect(await screen.findByText("login screen")).toBeInTheDocument();
  });
});
