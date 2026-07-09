/**
 * Applies the user's chosen theme (claro / medio / oscuro) app-wide by
 * stamping `data-theme` on <html> — index.css maps each id to its palette.
 * Mounted at the App root so the auth screens are themed too, not just the
 * authenticated shell.
 */

import { useEffect } from "react";

import { useLayout } from "../../modules/dashboard/layoutRepo";

export function ThemeApplier() {
  const theme = useLayout().theme;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return null;
}
