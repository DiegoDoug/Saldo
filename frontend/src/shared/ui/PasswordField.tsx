/**
 * Password input with an accessible show/hide toggle, built on TextField so it
 * inherits the label/error wiring. The toggle is a real, keyboard-operable
 * button (type="button" so it never submits the form).
 */

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import { TextField } from "./TextField";

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, error, hint, ...inputProps }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <TextField
        ref={ref}
        label={label}
        error={error}
        hint={hint}
        type={visible ? "text" : "password"}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={visible}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-soft"
          >
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        }
        {...inputProps}
      />
    );
  },
);
