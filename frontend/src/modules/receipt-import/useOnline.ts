/**
 * Reactive `navigator.onLine`. Scanning a receipt is the one action in this
 * app that genuinely requires the network (OCR + the DeepSeek call) — every
 * other write goes to Dexie first and syncs later, so this is the first place
 * the UI needs to react to connectivity rather than just checking it once
 * before a background sync (see `sync/syncEngine.ts`, `sync/SyncProvider.tsx`).
 */

import { useEffect, useState } from "react";

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const setTrue = () => setOnline(true);
    const setFalse = () => setOnline(false);
    window.addEventListener("online", setTrue);
    window.addEventListener("offline", setFalse);
    return () => {
      window.removeEventListener("online", setTrue);
      window.removeEventListener("offline", setFalse);
    };
  }, []);

  return online;
}
