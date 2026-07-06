/**
 * Tag colours. A tag's colour comes from its registry row when set; otherwise a
 * deterministic fallback keeps the same name the same colour everywhere, so a
 * chip is never grey and never flickers between renders.
 */

import { CATEGORY_COLORS } from "../../shared/theme";

/** Stable name → palette index (small FNV-ish hash), so "comida" is always green. */
export function fallbackTagColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

/** Resolve a tag name to its colour using the registry, falling back by name. */
export function tagColor(name: string, registry: Map<string, string>): string {
  const stored = registry.get(name);
  return stored && stored.length > 0 ? stored : fallbackTagColor(name);
}
