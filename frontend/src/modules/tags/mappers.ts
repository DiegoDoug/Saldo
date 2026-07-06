/** Wire ↔ local mapping for the tag registry. */

import type { LocalTag } from "../../db/db";

export interface WireTag {
  id: string;
  name: string;
  color: string;
  updated_at: string;
  deleted: boolean;
}

export function wireToLocalTag(w: WireTag): LocalTag {
  return {
    id: w.id,
    name: w.name,
    color: w.color ?? "",
    updatedAt: w.updated_at,
    deleted: w.deleted ? 1 : 0,
  };
}

export function localTagToSync(t: LocalTag) {
  return {
    id: t.id,
    name: t.name,
    color: t.color,
    updated_at: t.updatedAt,
    deleted: t.deleted === 1,
  };
}
