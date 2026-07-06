/** Reactive tag-registry reads from Dexie (offline-first). */

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";

import { db, type LocalTag } from "../../db/db";

export function useTags(): LocalTag[] {
  return (
    useLiveQuery(async () => {
      const all = await db.tags.where("deleted").equals(0).toArray();
      return all.sort((a, b) => a.name.localeCompare(b.name));
    }, []) ?? []
  );
}

/** A name → colour map from the registry, for resolving chip colours. */
export function useTagColors(): Map<string, string> {
  const tags = useTags();
  return useMemo(() => new Map(tags.map((t) => [t.name, t.color])), [tags]);
}

/** Distinct tag names actually used across live transactions. */
export function useUsedTagNames(): string[] {
  return (
    useLiveQuery(async () => {
      const txs = await db.transactions.where("deleted").equals(0).toArray();
      const names = new Set<string>();
      for (const t of txs) for (const name of t.tags) names.add(name);
      return [...names].sort((a, b) => a.localeCompare(b));
    }, []) ?? []
  );
}
