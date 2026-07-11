/**
 * TanStack Query hooks for the import-bank-file flow.
 *
 * Mirrors `receipt-import/hooks.ts`: server-only data, polled with
 * `refetchInterval` while the pipeline runs, then stopped. This data doesn't
 * belong in the Dexie/sync pipeline at all (see `api.ts`).
 */

import { useMutation, useQuery } from "@tanstack/react-query";

import {
  confirmBankImport,
  discardBankImport,
  getBankImport,
  isBankImportPending,
  uploadBankFile,
} from "./api";

export function useUploadBankFile() {
  return useMutation({ mutationFn: uploadBankFile });
}

const POLL_INTERVAL_MS = 1500;

/** Polls an import's status while the pipeline is still running, then stops. */
export function useBankImport(importId: string | null) {
  return useQuery({
    queryKey: ["bankImport", importId],
    queryFn: () => getBankImport(importId!),
    enabled: importId !== null,
    refetchInterval: (query) =>
      isBankImportPending(query.state.data?.status ?? "uploaded") ? POLL_INTERVAL_MS : false,
    staleTime: 0,
  });
}

export function useDiscardBankImport() {
  return useMutation({ mutationFn: discardBankImport });
}

export function useConfirmBankImport() {
  return useMutation({
    mutationFn: ({ id, transactionCount }: { id: string; transactionCount: number }) =>
      confirmBankImport(id, transactionCount),
  });
}
