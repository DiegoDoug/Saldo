/**
 * Turns a reviewed set of `movimientos` into real, offline-first Dexie rows.
 *
 * This is the only place the bank-import flow writes ledger data, and it does
 * so exclusively through the existing per-module `localRepo`s — the same
 * functions the manual Accounts/Categories/Merchants/Tags/Transactions screens
 * use — so everything created here syncs up on the next push exactly like a
 * manual entry. The AI pipeline never gets a write path to the ledger.
 *
 * The new `cuentas`/`categorias`/`comercios`/`etiquetas` to create are derived
 * from the movements actually being imported — not from the draft's full
 * proposal lists — so dropping a movement (or overriding a transfer's
 * destination to an existing account in the review form) never leaves an orphan
 * entity behind. The draft's proposal lists are consulted only for each new
 * entity's `kind` (account type / category kind). Referenced entities are
 * created first, deduplicated by name case-insensitively, so every movement can
 * then point at a real id.
 *
 * A movement with no resolvable source account falls back to `defaultAccountId`
 * (the review form guarantees one is selected). Transfers are written with
 * `addTransfer` (source -> destination); the destination is whatever the review
 * form resolved — the AI's match, its proposed new account, or an account the
 * user assigned by hand. A transfer that still can't resolve two *distinct*
 * accounts is skipped rather than written malformed.
 */

import { addAccount } from "../accounts/localRepo";
import { addCategory } from "../budgeting/localRepo";
import { addMerchant } from "../merchants/localRepo";
import { ensureTags } from "../tags/localRepo";
import { addTransaction, addTransfer } from "../transactions/localRepo";
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

/** name-key -> proposed `kind`, from a draft proposal list. */
function kindLookup(entities: ProposedEntity[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const e of entities) if (!map.has(key(e.name))) map.set(key(e.name), e.kind);
  return map;
}

/** Distinct display names produced by `pick` across all movements, keyed. */
function collectNames(
  movements: DraftMovement[],
  pick: (m: DraftMovement) => (string | null)[],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const m of movements) {
    for (const raw of pick(m)) {
      if (raw && raw.trim() && !names.has(key(raw))) names.set(key(raw), raw.trim());
    }
  }
  return names;
}

async function createEach(
  names: Map<string, string>,
  kinds: Map<string, string | null>,
  create: (name: string, kind: string | null) => Promise<string>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [k, name] of names) ids.set(k, await create(name, kinds.get(k) ?? null));
  return ids;
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
  const accountIds = await createEach(
    collectNames(movements, (m) => [m.accountRef, m.transferAccountRef]),
    kindLookup(draft.newAccounts),
    (name, kind) => addAccount({ name, type: accountType(kind), currency }),
  );
  const categoryIds = await createEach(
    collectNames(movements, (m) => [m.categoryRef]),
    kindLookup(draft.newCategories),
    (name, kind) => addCategory(name, categoryKind(kind)),
  );
  const merchantIds = await createEach(
    collectNames(movements, (m) => [m.merchantRef]),
    new Map(),
    (name) => addMerchant({ name }),
  );
  const tags = [...collectNames(movements, (m) => m.tags).values()];
  if (tags.length > 0) await ensureTags(tags);

  const resolve = (id: string | null, ref: string | null, map: Map<string, string>) =>
    id ?? (ref ? (map.get(key(ref)) ?? null) : null);

  let count = 0;
  for (const m of movements) {
    if (!m.amount || m.amount <= 0) continue;
    const accountId = resolve(m.accountId, m.accountRef, accountIds) ?? defaultAccountId;
    if (!accountId) continue;

    if (m.type === "transfer") {
      const toAccountId = resolve(m.transferAccountId, m.transferAccountRef, accountIds);
      if (!toAccountId || toAccountId === accountId) continue; // needs two distinct accounts
      await addTransfer({
        amount: m.amount,
        currency,
        fromAccountId: accountId,
        toAccountId,
        date: m.date ?? undefined,
        notes: m.notes ?? m.description ?? "",
      });
    } else {
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
    }
    count += 1;
  }
  return { transactionCount: count };
}
