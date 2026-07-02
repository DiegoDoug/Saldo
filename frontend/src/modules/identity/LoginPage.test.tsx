import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { route: "/login" });
    const password = screen.getByLabelText("Contraseña");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: /mostrar contraseña/i }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: /ocultar contraseña/i }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("validates the email on submit without calling the API", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { route: "/login" });
    await user.type(screen.getByLabelText("Correo"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));
    expect(await screen.findByText(/correo válido/i)).toBeInTheDocument();
  });
});
