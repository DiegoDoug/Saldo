/**
 * Dexie-first operations for the tag registry. Every mutation writes locally
 * first (offline-safe); the sync engine propagates in the background. Deletes are
 * tombstones. `ensureTags` backs "create-on-type": any tag name used on a
 * transaction gets a registry row (with a fallback colour) if it doesn't have one.
 */

import { db, type LocalTag } from "../../db/db";
import { fallbackTagColor } from "./tagColor";

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/** Live (non-deleted) registry rows, newest write wins on name collisions. */
async function liveByName(): Promise<Map<string, LocalTag>> {
  const all = await db.tags.where("deleted").equals(0).toArray();
  return new Map(all.map((t) => [t.name, t]));
}

/** Ensure a registry row exists for each name; create missing ones in one txn. */
export async function ensureTags(names: string[]): Promise<void> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (wanted.length === 0) return;
  await db.transaction("rw", db.tags, async () => {
    const existing = await liveByName();
    const ts = nowIso();
    const missing = wanted
      .filter((name) => !existing.has(name))
      .map((name) => ({
        id: newId(),
        name,
        color: fallbackTagColor(name),
        updatedAt: ts,
        deleted: 0 as const,
      }));
    if (missing.length) await db.tags.bulkPut(missing);
  });
}

export async function setTagColor(id: string, color: string): Promise<void> {
  await db.tags.update(id, { color, updatedAt: nowIso() });
}

export async function deleteTag(id: string): Promise<void> {
  await db.tags.update(id, { deleted: 1, updatedAt: nowIso() });
}

/**
 * Rename a tag across the registry *and* every transaction that carries the old
 * name, in one transaction, so membership (JSON) and registry stay consistent.
 */
export async function renameTag(id: string, nextName: string): Promise<void> {
  const name = nextName.trim();
  if (!name) return;
  await db.transaction("rw", db.tags, db.transactions, async () => {
    const tag = await db.tags.get(id);
    if (!tag || tag.name === name) return;
    const ts = nowIso();
    await db.tags.update(id, { name, updatedAt: ts });
    const affected = await db.transactions.filter((t) => t.tags.includes(tag.name)).toArray();
    await Promise.all(
      affected.map((t) =>
        db.transactions.update(t.id, {
          tags: t.tags.map((x) => (x === tag.name ? name : x)),
          updatedAt: ts,
        }),
      ),
    );
  });
}
