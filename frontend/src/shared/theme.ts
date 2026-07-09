/**
 * Palette exposed to JavaScript (for Recharts and inline styles that can't use
 * Tailwind classes). Reads the active theme's CSS variables (see index.css) at
 * access time, so charts drawn after a theme switch pick up the right colors.
 * Falls back to the "claro" values when no DOM is available (tests, SSR).
 */

const FALLBACK = {
  paper: "#FBF7F0",
  card: "#FFFFFF",
  ink: "#1C2826",
  inkSoft: "#5C6A66",
  line: "#E7E0D4",
  mint: "#2F8F6F",
  mintSoft: "#E4F2EB",
  coral: "#E06B52",
  coralSoft: "#FBE7E1",
  gold: "#C9A227",
  blue: "#3E6E8E",
  lilac: "#7C6CA8",
} as const;

type ColorKey = keyof typeof FALLBACK;

/** `inkSoft` → `--c-ink-soft`, matching the variable names in index.css. */
function cssVarName(key: ColorKey): string {
  return `--c-${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
}

// Resolved colors, cached per theme: getComputedStyle forces a style recalc,
// and chart-heavy renders read many tokens each — without the cache a single
// dashboard render would trigger dozens of those.
let cacheTheme: string | undefined;
let cacheColors: Partial<Record<ColorKey, string>> = {};

function themeColor(key: ColorKey): string {
  if (typeof document === "undefined") return FALLBACK[key];
  const theme = document.documentElement.dataset.theme;
  if (theme !== cacheTheme) {
    cacheTheme = theme;
    cacheColors = {};
  }
  let value = cacheColors[key];
  if (!value) {
    const triplet = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVarName(key))
      .trim();
    value = triplet ? `rgb(${triplet})` : FALLBACK[key];
    cacheColors[key] = value;
  }
  return value;
}

export const C: Record<ColorKey, string> = Object.defineProperties(
  {} as Record<ColorKey, string>,
  Object.fromEntries(
    (Object.keys(FALLBACK) as ColorKey[]).map((key) => [
      key,
      { get: () => themeColor(key), enumerable: true },
    ]),
  ),
);

/** Horizontal indent, in pixels, per nesting level for a subcategory row. */
export const CATEGORY_INDENT_PX = 18;

/** User-assignable category accents. Fixed hexes on purpose: a category keeps
 * its chosen color across themes (they read fine on all three backdrops). */
export const CATEGORY_COLORS = [
  "#2F8F6F",
  "#3E6E8E",
  "#7C6CA8",
  "#C9A227",
  "#E06B52",
  "#D98C5F",
  "#5BA4A0",
  "#A86C9E",
];

export const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
