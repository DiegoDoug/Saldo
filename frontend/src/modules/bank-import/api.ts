/**
 * Bank-import API calls against `/bank-imports`.
 *
 * Kept framework-free (no React), same convention as `receipt-import/api.ts`.
 * This entity is deliberately server-only — the draft it produces is transient
 * working state, never written to Dexie. The `movimientos`, `cuentas`,
 * `categorias`, `comercios`, `etiquetas` and `recibos` a confirmed import
 * produces are still created the normal, offline-first way, via the existing
 * per-module `localRepo`s (see `BankReviewForm.tsx`); this module never writes
 * ledger data to Dexie itself.
 */

import { apiRequest, apiUploadRequest } from "../../shared/api/client";

export type BankImportStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "confirmed"
  | "discarded";

export type MovementType = "income" | "expense" | "transfer";

export interface DraftMovement {
  date: string | null;
  description: string | null;
  type: MovementType;
  amount: number | null;
  currency: string | null;
  accountId: string | null;
  accountRef: string | null;
  categoryId: string | null;
  categoryRef: string | null;
  merchantId: string | null;
  merchantRef: string | null;
  tags: string[];
  isRecurring: boolean;
  notes: string | null;
  confidence: number | null;
}

export interface ProposedEntity {
  name: string;
  kind: string | null;
}

export interface DraftBankAnalysis {
  bankName: string | null;
  currency: string | null;
  movements: DraftMovement[];
  newAccounts: ProposedEntity[];
  newCategories: ProposedEntity[];
  newMerchants: ProposedEntity[];
  newTags: ProposedEntity[];
  warnings: string[];
  overallConfidence: number;
}

export interface BankImport {
  id: string;
  status: BankImportStatus;
  fileName: string;
  draft: DraftBankAnalysis | null;
  errorMessage: string | null;
  duplicateOf: string | null;
  createdTransactionCount: number | null;
  createdAt: string;
}

/** True while the pipeline is still working — the caller should keep polling. */
export function isBankImportPending(status: BankImportStatus): boolean {
  return status === "uploaded" || status === "processing";
}

interface RawMovement {
  date: string | null;
  description: string | null;
  type: MovementType;
  amount: number | null;
  currency: string | null;
  account_id: string | null;
  account_ref: string | null;
  category_id: string | null;
  category_ref: string | null;
  merchant_id: string | null;
  merchant_ref: string | null;
  tags: string[];
  is_recurring: boolean;
  notes: string | null;
  confidence: number | null;
}

interface RawDraft {
  bank_name: string | null;
  currency: string | null;
  movements: RawMovement[];
  new_accounts: ProposedEntity[];
  new_categories: ProposedEntity[];
  new_merchants: ProposedEntity[];
  new_tags: ProposedEntity[];
  warnings: string[];
  overall_confidence: number;
}

interface RawBankImport {
  id: string;
  status: BankImportStatus;
  file_name: string;
  draft: RawDraft | null;
  error_message: string | null;
  duplicate_of: string | null;
  created_transaction_count: number | null;
  created_at: string;
}

function toMovement(raw: RawMovement): DraftMovement {
  return {
    date: raw.date,
    description: raw.description,
    type: raw.type,
    amount: raw.amount,
    currency: raw.currency,
    accountId: raw.account_id,
    accountRef: raw.account_ref,
    categoryId: raw.category_id,
    categoryRef: raw.category_ref,
    merchantId: raw.merchant_id,
    merchantRef: raw.merchant_ref,
    tags: raw.tags,
    isRecurring: raw.is_recurring,
    notes: raw.notes,
    confidence: raw.confidence,
  };
}

function toMovementPayload(m: DraftMovement): RawMovement {
  return {
    date: m.date,
    description: m.description,
    type: m.type,
    amount: m.amount,
    currency: m.currency,
    account_id: m.accountId,
    account_ref: m.accountRef,
    category_id: m.categoryId,
    category_ref: m.categoryRef,
    merchant_id: m.merchantId,
    merchant_ref: m.merchantRef,
    tags: m.tags,
    is_recurring: m.isRecurring,
    notes: m.notes,
    confidence: m.confidence,
  };
}

function toDraft(raw: RawDraft): DraftBankAnalysis {
  return {
    bankName: raw.bank_name,
    currency: raw.currency,
    movements: raw.movements.map(toMovement),
    newAccounts: raw.new_accounts,
    newCategories: raw.new_categories,
    newMerchants: raw.new_merchants,
    newTags: raw.new_tags,
    warnings: raw.warnings,
    overallConfidence: raw.overall_confidence,
  };
}

function toBankImport(raw: RawBankImport): BankImport {
  return {
    id: raw.id,
    status: raw.status,
    fileName: raw.file_name,
    draft: raw.draft ? toDraft(raw.draft) : null,
    errorMessage: raw.error_message,
    duplicateOf: raw.duplicate_of,
    createdTransactionCount: raw.created_transaction_count,
    createdAt: raw.created_at,
  };
}

export async function uploadBankFile(file: File): Promise<BankImport> {
  const raw = await apiUploadRequest<RawBankImport>("/bank-imports", file);
  return toBankImport(raw);
}

export async function getBankImport(id: string): Promise<BankImport> {
  const raw = await apiRequest<RawBankImport>(`/bank-imports/${id}`);
  return toBankImport(raw);
}

export async function patchBankDraft(
  id: string,
  movements: DraftMovement[],
): Promise<BankImport> {
  const raw = await apiRequest<RawBankImport>(`/bank-imports/${id}/draft`, {
    method: "PATCH",
    json: { movements: movements.map(toMovementPayload) },
  });
  return toBankImport(raw);
}

export async function discardBankImport(id: string): Promise<void> {
  await apiRequest<void>(`/bank-imports/${id}`, { method: "DELETE" });
}

/**
 * Records how many transactions this import produced (the rows themselves are
 * already Dexie-written, offline-first). Purely metadata/history on the backend.
 */
export async function confirmBankImport(
  id: string,
  transactionCount: number,
): Promise<BankImport> {
  const raw = await apiRequest<RawBankImport>(`/bank-imports/${id}/confirm`, {
    method: "POST",
    json: { transaction_count: transactionCount },
  });
  return toBankImport(raw);
}
