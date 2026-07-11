/**
 * A smoothly-advancing progress percentage for work whose real duration we
 * can't measure (the backend pipeline reports only "processing" / "ready", not
 * a completion fraction). The AI parse of a whole statement takes real,
 * variable time; a determinate-looking bar that keeps creeping forward reads as
 * "making progress" and keeps the user waiting instead of giving up, which a
 * bare spinner does not.
 *
 * It eases toward an asymptote (`CEILING`) so it never reaches 100% on its own
 * — the caller snaps it to 100 once the work actually finishes (`done`). The
 * step shrinks as it approaches the ceiling, so it visibly slows down the
 * longer it runs rather than stalling flat.
 */

import { useEffect, useState } from "react";

const CEILING = 94; // never fake-complete; the real finish jumps to 100
const TICK_MS = 400;
const APPROACH = 0.12; // fraction of the remaining gap covered each tick

export function useFakeProgress(active: boolean, done: boolean): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (done) {
      setProgress(100);
      return;
    }
    if (!active) {
      setProgress(0);
      return;
    }
    const id = setInterval(() => {
      setProgress((p) => (p >= CEILING ? p : Math.min(CEILING, p + (CEILING - p) * APPROACH)));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [active, done]);

  return Math.round(progress);
}
