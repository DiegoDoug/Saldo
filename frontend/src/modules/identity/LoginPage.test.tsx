import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/utils";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  it("renders the login form", () => {
    renderWithProviders(<LoginPage />, { route: "/login" });
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it("links to the register screen", () => {
    renderWithProviders(<LoginPage />, { route: "/login" });
    expect(screen.getByRole("link", { name: /regístrate/i })).toBeInTheDocument();
  });
});
