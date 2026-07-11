/**
 * Turns a reviewed `DraftBankAnalysis` into real, offline-first Dexie rows.
 *
 * This is the only place the bank-import flow writes ledger data, and it does
 * so exclusively through the existing per-module `localRepo`s — the same
 * functions the manual Accounts/Categories/Merchants/Tags/Transactions screens
 * use — so everything created here syncs up on the next push exactly like a
 * manual entry. The AI pipeline never gets a write path to the ledger.
 *
 * Order matters: the referenced `cuentas`, `categorias`, `comercios` and
 * `etiquetas` are created first (deduplicated by name, case-insensitively) so
 * each `movimiento` can point at a real id. A movement with no resolvable
 * account falls back to `defaultAccountId` — the review form guarantees one is
 * selected before confirm is enabled.
 */

import { addAccount } from "../accounts/localRepo";
import { addCategory } from "../budgeting/localRepo";
import { addMerchant } from "../merchants/localRepo";
import { ensureTags } from "../tags/localRepo";
import { addTransaction } from "../transactions/localRepo";
import type { AccountType } from "../../db/db";
import type { DraftBankAnalysis, DraftMovement, ProposedEntity } from "./api";

const ACCOUNT_TYPES: AccountType[] = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "investment",
  "crypto",
];
const CATEGORY_KINDS = ["income", "fixed", "variable"] as const;
type CategoryKind = (typeof CATEGORY_KINDS)[number];

const key = (name: string) => name.trim().toLowerCase();

function accountType(kind: string | null): AccountType {
  return ACCOUNT_TYPES.includes(kind as AccountType) ? (kind as AccountType) : "checking";
}

function categoryKind(kind: string | null): CategoryKind {
  return CATEGORY_KINDS.includes(kind as CategoryKind) ? (kind as CategoryKind) : "variable";
}

async function createByName(
  entities: ProposedEntity[],
  create: (e: ProposedEntity) => Promise<string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const entity of entities) {
    const k = key(entity.name);
    if (!map.has(k)) map.set(k, await create(entity));
  }
  return map;
}

export interface ConfirmResult {
  transactionCount: number;
}

export async function confirmDraft(
  draft: DraftBankAnalysis,
  movements: DraftMovement[],
  defaultAccountId: string,
  currency: string | undefined,
): Promise<ConfirmResult> {
  const accountIds = await createByName(draft.newAccounts, (e) =>
    addAccount({ name: e.name, type: accountType(e.kind), currency }),
  );
  const categoryIds = await createByName(draft.newCategories, (e) =>
    addCategory(e.name, categoryKind(e.kind)),
  );
  const merchantIds = await createByName(draft.newMerchants, (e) =>
    addMerchant({ name: e.name }),
  );
  await ensureTags(draft.newTags.map((t) => t.name));

  const resolve = (id: string | null, ref: string | null, map: Map<string, string>) =>
    id ?? (ref ? (map.get(key(ref)) ?? null) : null);

  let count = 0;
  for (const m of movements) {
    if (m.type === "transfer") continue; // transfers need a second account we don't model here
    const accountId = resolve(m.accountId, m.accountRef, accountIds) ?? defaultAccountId;
    if (!accountId || !m.amount || m.amount <= 0) continue;
    await addTransaction({
      type: m.type,
      amount: m.amount,
      currency,
      accountId,
      categoryId: resolve(m.categoryId, m.categoryRef, categoryIds),
      merchantId: resolve(m.merchantId, m.merchantRef, merchantIds),
      date: m.date ?? undefined,
      notes: m.notes ?? m.description ?? "",
      tags: m.tags,
    });
    count += 1;
  }
  return { transactionCount: count };
}
