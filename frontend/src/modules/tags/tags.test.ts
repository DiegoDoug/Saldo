import { describe, expect, it } from "vitest";

import { localTagToSync, wireToLocalTag, type WireTag } from "./mappers";
import { fallbackTagColor, tagColor } from "./tagColor";

describe("tag mappers", () => {
  it("round-trips wire → local → sync", () => {
    const wire: WireTag = {
      id: "t1",
      name: "comida",
      color: "#2F8F6F",
      updated_at: "2026-02-02T00:00:00.000Z",
      deleted: false,
    };
    const local = wireToLocalTag(wire);
    expect(local.name).toBe("comida");
    expect(local.color).toBe("#2F8F6F");
    expect(local.deleted).toBe(0);

    const back = localTagToSync(local);
    expect(back.color).toBe("#2F8F6F");
    expect(back.deleted).toBe(false);
  });
});

describe("tagColor", () => {
  it("is deterministic per name", () => {
    expect(fallbackTagColor("comida")).toBe(fallbackTagColor("comida"));
  });

  it("prefers a registered colour, falls back by name otherwise", () => {
    const registry = new Map([["comida", "#123456"]]);
    expect(tagColor("comida", registry)).toBe("#123456");
    // Unregistered (and empty-string) names fall back deterministically.
    expect(tagColor("ocio", registry)).toBe(fallbackTagColor("ocio"));
    expect(tagColor("x", new Map([["x", ""]]))).toBe(fallbackTagColor("x"));
  });
});
