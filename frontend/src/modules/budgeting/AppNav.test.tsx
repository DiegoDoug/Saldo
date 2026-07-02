import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/utils";
import { AppNav } from "./AppNav";

describe("AppNav (grouped bottom nav)", () => {
  it("shows the direct link and the group pills", () => {
    renderWithProviders(<AppNav />);
    expect(screen.getByRole("link", { name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dinero" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Objetivos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Análisis" })).toBeInTheDocument();
  });

  it("keeps group destinations hidden until the pill is clicked", () => {
    renderWithProviders(<AppNav />);
    expect(screen.queryByRole("menuitem", { name: "Movimientos" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dinero" }));

    const menu = screen.getByRole("menu", { name: "Dinero" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Movimientos" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Cuentas" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Recibos" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Comercios" })).toBeInTheDocument();
  });

  it("marks the group button expanded while open", () => {
    renderWithProviders(<AppNav />);
    const pill = screen.getByRole("button", { name: "Objetivos" });
    expect(pill).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(pill);
    expect(pill).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Patrimonio" })).toBeInTheDocument();
  });
});
