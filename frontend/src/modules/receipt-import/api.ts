/**
 * Receipt-import API calls against `/receipt-imports`.
 *
 * Kept framework-free (no React), same convention as `identity/api.ts`. This
 * entity is deliberately server-only — see the backend's
 * `docs/receipt-import/01-architecture-review.md` §4 — so unlike every other
 * module here there is no `localRepo.ts`/Dexie table: nothing here is written
 * offline-first, because scanning a receipt inherently requires the network
 * (OCR + the DeepSeek call). The Transaction a confirmed receipt produces is
 * still created the normal, offline-first way, via `transactions/localRepo.ts`
 * — this module never touches Dexie.
 */

import { apiRequest, apiUploadRequest } from "../../shared/api/client";

export type ReceiptStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "confirmed"
  | "discarded";

export interface FieldValue {
  value: unknown;
  confidence: number | null;
}

export type MerchantMatchType = "exact" | "fuzzy" | "semantic" | "none";
export type CategoryMatchType =
  | "merchant_default"
  | "existing_similarity"
  | "ai_semantic"
  | "suggest_new";

export interface MerchantMatch {
  rawText: string | null;
  matchedMerchantId: string | null;
  suggestedName: string | null;
  matchType: MerchantMatchType;
  confidence: number;
}

export interface CategoryMatch {
  matchedCategoryId: string | null;
  suggestedName: string | null;
  matchType: CategoryMatchType;
  confidence: number;
}

export interface DraftReceiptAnalysis {
  merchant: MerchantMatch;
  category: CategoryMatch;
  amount: FieldValue;
  currency: FieldValue;
  date: FieldValue;
  tax: FieldValue;
  paymentMethod: FieldValue;
  receiptNumber: FieldValue;
  address: FieldValue;
  notes: FieldValue;
  lineItems: unknown[];
  warnings: string[];
  missingFields: string[];
  overallConfidence: number;
}

export interface ReceiptImport {
  id: string;
  status: ReceiptStatus;
  draft: DraftReceiptAnalysis | null;
  errorMessage: string | null;
  duplicateOf: string | null;
  linkedTransactionId: string | null;
  createdAt: string;
}

/** True while the pipeline is still working — the caller should keep polling. */
export function isReceiptPending(status: ReceiptStatus): boolean {
  return status === "uploaded" || status === "processing";
}

function toFieldValue(raw: { value: unknown; confidence: number | null }): FieldValue {
  return { value: raw.value, confidence: raw.confidence };
}

function toMerchantMatch(raw: {
  raw_text: string | null;
  matched_merchant_id: string | null;
  suggested_name: string | null;
  match_type: MerchantMatchType;
  confidence: number;
}): MerchantMatch {
  return {
    rawText: raw.raw_text,
    matchedMerchantId: raw.matched_merchant_id,
    suggestedName: raw.suggested_name,
    matchType: raw.match_type,
    confidence: raw.confidence,
  };
}

function toCategoryMatch(raw: {
  matched_category_id: string | null;
  suggested_name: string | null;
  match_type: CategoryMatchType;
  confidence: number;
}): CategoryMatch {
  return {
    matchedCategoryId: raw.matched_category_id,
    suggestedName: raw.suggested_name,
    matchType: raw.match_type,
    confidence: raw.confidence,
  };
}

interface RawDraft {
  merchant: Parameters<typeof toMerchantMatch>[0];
  category: Parameters<typeof toCategoryMatch>[0];
  amount: FieldValue;
  currency: FieldValue;
  date: FieldValue;
  tax: FieldValue;
  payment_method: FieldValue;
  receipt_number: FieldValue;
  address: FieldValue;
  notes: FieldValue;
  line_items: unknown[];
  warnings: string[];
  missing_fields: string[];
  overall_confidence: number;
}

interface RawReceiptImport {
  id: string;
  status: ReceiptStatus;
  draft: RawDraft | null;
  error_message: string | null;
  duplicate_of: string | null;
  linked_transaction_id: string | null;
  created_at: string;
}

function toDraft(raw: RawDraft): DraftReceiptAnalysis {
  return {
    merchant: toMerchantMatch(raw.merchant),
    category: toCategoryMatch(raw.category),
    amount: toFieldValue(raw.amount),
    currency: toFieldValue(raw.currency),
    date: toFieldValue(raw.date),
    tax: toFieldValue(raw.tax),
    paymentMethod: toFieldValue(raw.payment_method),
    receiptNumber: toFieldValue(raw.receipt_number),
    address: toFieldValue(raw.address),
    notes: toFieldValue(raw.notes),
    lineItems: raw.line_items,
    warnings: raw.warnings,
    missingFields: raw.missing_fields,
    overallConfidence: raw.overall_confidence,
  };
}

function toReceiptImport(raw: RawReceiptImport): ReceiptImport {
  return {
    id: raw.id,
    status: raw.status,
    draft: raw.draft ? toDraft(raw.draft) : null,
    errorMessage: raw.error_message,
    duplicateOf: raw.duplicate_of,
    linkedTransactionId: raw.linked_transaction_id,
    createdAt: raw.created_at,
  };
}

export async function uploadReceipt(file: File): Promise<ReceiptImport> {
  const raw = await apiUploadRequest<RawReceiptImport>("/receipt-imports", file);
  return toReceiptImport(raw);
}

export async function getReceipt(id: string): Promise<ReceiptImport> {
  const raw = await apiRequest<RawReceiptImport>(`/receipt-imports/${id}`);
  return toReceiptImport(raw);
}

export async function discardReceipt(id: string): Promise<void> {
  await apiRequest<void>(`/receipt-imports/${id}`, { method: "DELETE" });
}

/**
 * Records that this receipt produced the given (already Dexie-written)
 * transaction. Purely metadata/history on the backend — the transaction
 * itself was already created client-side, offline-first, the same way a
 * manually entered one is. See `ReceiptReviewForm.tsx`.
 */
export async function confirmReceipt(id: string, transactionId: string): Promise<ReceiptImport> {
  const raw = await apiRequest<RawReceiptImport>(`/receipt-imports/${id}/confirm`, {
    method: "POST",
    json: { transaction_id: transactionId },
  });
  return toReceiptImport(raw);
}
