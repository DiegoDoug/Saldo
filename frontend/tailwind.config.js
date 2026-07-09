/**
 * Palette tokens as CSS variables — the single source of truth for the app's
 * visual direction lives in src/index.css, where each theme (claro / medio /
 * oscuro) assigns the variables. Use these named colors (bg-mint, text-coral,
 * border-line) instead of hex literals so every screen follows the active
 * theme. The `<alpha-value>` form keeps opacity modifiers (bg-card/95) working.
 */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: c("paper"),
        card: c("card"),
        ink: c("ink"),
        "ink-soft": c("ink-soft"),
        line: c("line"),
        mint: c("mint"),
        "mint-soft": c("mint-soft"),
        coral: c("coral"),
        "coral-soft": c("coral-soft"),
        gold: c("gold"),
        blue: c("blue"),
        lilac: c("lilac"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
    },
  },
  plugins: [],
};
