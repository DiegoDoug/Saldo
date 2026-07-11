/**
 * Determinate progress bar with a live percentage count, used while the bank
 * pipeline runs. The percentage is driven by `useFakeProgress` (the backend
 * doesn't report a real fraction) — see that hook for why a moving bar beats a
 * bare spinner here. Uses the app's mint accent and `card-panel`-consistent
 * rounding/colours.
 */

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between text-sm text-ink-soft">
        <span>{label ?? "Analizando el extracto…"}</span>
        <span className="tabular-nums font-medium text-ink">{percent}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-mint-soft"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-mint transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
