/**
 * Accessible labeled text input for the app's forms.
 *
 * Wires up the label/input association, error messaging (aria-invalid +
 * aria-describedby), and an optional trailing control slot (used by
 * PasswordField for the visibility toggle). Uses the shared `.field-input`
 * styling so it stays consistent with the rest of the design system.
 */

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Validation message; when present the field renders in its error state. */
  error?: string | null;
  /** Optional helper text shown below the field while there's no error. */
  hint?: ReactNode;
  /** Control rendered inside the field frame (e.g. a password toggle). */
  trailing?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, trailing, id, className, ...inputProps },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy =
    [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          className={[
            "field-input",
            trailing ? "pr-12" : "",
            error ? "border-coral focus:border-coral focus:ring-coral-soft" : "",
            className ?? "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-coral" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
