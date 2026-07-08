/**
 * TanStack Query hooks for the scan-receipt flow.
 *
 * TanStack Query is already wired app-wide (`main.tsx`) but otherwise only
 * used by `identity`'s login/register mutations — the sync loop is a plain
 * interval, not `useQuery`. Receipt-import's status polling is the first use
 * of `refetchInterval`, chosen deliberately over extending the sync engine:
 * this data is server-only (see `api.ts`), so it doesn't belong in the
 * Dexie/sync pipeline at all.
 */

import { useMutation, useQuery } from "@tanstack/react-query";

import { confirmReceipt, discardReceipt, getReceipt, isReceiptPending, uploadReceipt } from "./api";

export function useUploadReceipt() {
  return useMutation({ mutationFn: uploadReceipt });
}

const POLL_INTERVAL_MS = 1500;

/** Polls a receipt's status while the pipeline is still running, then stops. */
export function useReceiptImport(receiptId: string | null) {
  return useQuery({
    queryKey: ["receiptImport", receiptId],
    queryFn: () => getReceipt(receiptId!),
    enabled: receiptId !== null,
    refetchInterval: (query) =>
      isReceiptPending(query.state.data?.status ?? "uploaded") ? POLL_INTERVAL_MS : false,
    // This is transient pipeline state, not app data — never serve it stale.
    staleTime: 0,
  });
}

export function useDiscardReceipt() {
  return useMutation({ mutationFn: discardReceipt });
}

export function useConfirmReceipt() {
  return useMutation({
    mutationFn: ({ id, transactionId }: { id: string; transactionId: string }) =>
      confirmReceipt(id, transactionId),
  });
}
