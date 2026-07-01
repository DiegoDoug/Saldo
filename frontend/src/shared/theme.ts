/**
 * Cuaderno palette exposed to JavaScript (for Recharts and inline styles that
 * can't use Tailwind classes). Mirrors tailwind.config.js — keep them in sync.
 */

export const C = {
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
