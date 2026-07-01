/**
 * Currency input that shows a formatted value at rest and a plain editable
 * number while focused, committing the parsed amount on blur. Ported from the
 * prototype's MoneyInput.
 */

import { useState } from "react";

import { formatMoney, parseAmount } from "../format";

export function MoneyInput({
  value,
  onCommit,
  currency = "EUR",
  ariaLabel,
  accentClassName = "text-ink",
}: {
  value: number;
  onCommit: (value: number) => void;
  currency?: string;
  ariaLabel: string;
  accentClassName?: string;
}) {
  const [local, setLocal] = useState("");
  const [editing, setEditing] = useState(false);

  const display = editing ? local : value ? formatMoney(value, currency) : "";

  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder="0,00"
      className={`w-32 rounded-xl border border-transparent bg-paper px-3 py-2 text-right font-semibold tabular-nums outline-none transition focus:border-mint focus:bg-white focus:ring-2 focus:ring-mint-soft ${accentClassName}`}
      value={display}
      onFocus={(e) => {
        setEditing(true);
        setLocal(value ? String(value).replace(".", ",") : "");
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onCommit(parseAmount(local));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
