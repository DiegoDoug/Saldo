import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EntityCombobox } from "./EntityCombobox";

const OPTIONS = [
  { id: "1", name: "Mercadona" },
  { id: "2", name: "Carrefour" },
];

describe("EntityCombobox", () => {
  it("selects an existing option by typing and clicking it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <EntityCombobox
        label="Comercio"
        placeholder="Comercio…"
        options={OPTIONS}
        valueId={null}
        onSelect={onSelect}
        onCreate={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Comercio"), "Merca");
    await user.click(await screen.findByRole("button", { name: "Mercadona" }));

    expect(onSelect).toHaveBeenCalledWith("1");
  });

  it("offers to create a new entry when nothing matches, and selects the created id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCreate = vi.fn().mockResolvedValue("new-id");
    render(
      <EntityCombobox
        label="Comercio"
        placeholder="Comercio…"
        options={OPTIONS}
        valueId={null}
        onSelect={onSelect}
        onCreate={onCreate}
      />,
    );

    await user.type(screen.getByLabelText("Comercio"), "Tienda Nueva");
    await user.click(await screen.findByRole("button", { name: "Crear «Tienda Nueva»" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Tienda Nueva"));
    expect(onSelect).toHaveBeenCalledWith("new-id");
  });

  it("does not offer to create when the text exactly matches an existing option", async () => {
    const user = userEvent.setup();
    render(
      <EntityCombobox
        label="Comercio"
        placeholder="Comercio…"
        options={OPTIONS}
        valueId={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Comercio"), "Mercadona");
    expect(screen.queryByRole("button", { name: /Crear/ })).not.toBeInTheDocument();
  });

  it("syncs the display text once a matching option arrives after mount", () => {
    // Regression test: `options` come from a Dexie live query in real usage
    // and resolve asynchronously — a caller can render with a real `valueId`
    // before its matching option has loaded. Caught by hand in a real
    // browser (mocked hooks in other tests return data synchronously, which
    // hid this) — see docs/receipt-import/07-implementation-roadmap.md Stage 5.
    const { rerender } = render(
      <EntityCombobox
        label="Comercio"
        placeholder="Comercio…"
        options={[]}
        valueId="1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Comercio")).toHaveValue("");

    rerender(
      <EntityCombobox
        label="Comercio"
        placeholder="Comercio…"
        options={OPTIONS}
        valueId="1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Comercio")).toHaveValue("Mercadona");
  });

  it("falls back to initialQuery when there is no id match at all", () => {
    render(
      <EntityCombobox
        label="Comercio"
        placeholder="Comercio…"
        options={[]}
        valueId={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        initialQuery="Tienda Detectada"
      />,
    );
    expect(screen.getByLabelText("Comercio")).toHaveValue("Tienda Detectada");
  });

  it("clears the selection via Quitar", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <EntityCombobox
        label="Comercio"
        placeholder="Comercio…"
        options={OPTIONS}
        valueId="1"
        onSelect={onSelect}
        onCreate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
