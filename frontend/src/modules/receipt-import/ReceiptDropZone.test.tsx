import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReceiptDropZone } from "./ReceiptDropZone";

function makeFile(name: string, type: string, sizeBytes = 100) {
  const file = new File([new Uint8Array(sizeBytes)], name, { type });
  return file;
}

describe("ReceiptDropZone", () => {
  it("accepts a valid image and calls onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ReceiptDropZone onSelect={onSelect} />);

    const input = screen.getByLabelText("Elegir foto del recibo");
    const file = makeFile("recibo.jpg", "image/jpeg");
    await user.upload(input, file);

    expect(onSelect).toHaveBeenCalledWith(file);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects an unsupported file type dropped onto the zone, without calling onSelect", () => {
    // Dropped via drag-and-drop rather than the file input: the input's
    // `accept="image/*"` makes userEvent.upload filter out a non-image file
    // before it ever reaches our handler, which is realistic for the picker
    // but means only a drop can exercise this rejection path in a test.
    const onSelect = vi.fn();
    render(<ReceiptDropZone onSelect={onSelect} />);

    const zone = screen.getByRole("button");
    const file = makeFile("recibo.pdf", "application/pdf");
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Formato no admitido");
  });

  it("rejects an oversized file without calling onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ReceiptDropZone onSelect={onSelect} />);

    const input = screen.getByLabelText("Elegir foto del recibo");
    const tooBig = makeFile("recibo.jpg", "image/jpeg", 11 * 1024 * 1024);
    await user.upload(input, tooBig);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("máximo 10 MB");
  });
});
