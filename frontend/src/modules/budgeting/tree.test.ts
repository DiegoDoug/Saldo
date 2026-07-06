import { describe, expect, it } from "vitest";

import type { LocalCategory } from "../../db/db";
import { buildCategoryForest } from "./hooks";
import { localCategoryToSync, wireToLocalCategory, type WireCategory } from "./mappers";

function cat(partial: Partial<LocalCategory>): LocalCategory {
  return {
    id: crypto.randomUUID(),
    name: "",
    kind: "variable",
    position: 0,
    parentId: null,
    color: null,
    icon: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    deleted: 0,
    ...partial,
  };
}

describe("buildCategoryForest", () => {
  it("nests children under their parent, ordered by position", () => {
    const root = cat({ id: "r", name: "Casa", kind: "fixed" });
    const b = cat({ id: "b", name: "Agua", kind: "fixed", parentId: "r", position: 1 });
    const a = cat({ id: "a", name: "Luz", kind: "fixed", parentId: "r", position: 0 });

    const forest = buildCategoryForest([b, root, a]);
    expect(forest).toHaveLength(1);
    expect(forest[0].id).toBe("r");
    expect(forest[0].children.map((c) => c.name)).toEqual(["Luz", "Agua"]);
  });

  it("surfaces a category whose parent is absent as a root", () => {
    const orphan = cat({ id: "o", parentId: "missing" });
    const forest = buildCategoryForest([orphan]);
    expect(forest.map((c) => c.id)).toEqual(["o"]);
  });
});

describe("category wire/local round-trip", () => {
  it("preserves parentId, color, and icon", () => {
    const wire: WireCategory = {
      id: "x",
      name: "Luz",
      kind: "fixed",
      position: 2,
      parent_id: "r",
      color: "#6EE7B7",
      icon: "House",
      updated_at: "2026-02-02T00:00:00.000Z",
      deleted: false,
    };
    const local = wireToLocalCategory(wire);
    expect(local.parentId).toBe("r");
    expect(local.color).toBe("#6EE7B7");
    expect(local.icon).toBe("House");

    const back = localCategoryToSync(local);
    expect(back.parent_id).toBe("r");
    expect(back.color).toBe("#6EE7B7");
    expect(back.icon).toBe("House");
  });
});
