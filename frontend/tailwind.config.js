/**
 * Cuaderno palette as Tailwind theme tokens — the single source of truth for
 * the app's visual direction, lifted from reference/Presupuesto.tsx. Use these
 * named colors (bg-mint, text-coral, border-line) instead of hex literals so a
 * contributor changes the theme in one place.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBF7F0",
        card: "#FFFFFF",
        ink: "#1C2826",
        "ink-soft": "#5C6A66",
        line: "#E7E0D4",
        mint: "#2F8F6F",
        "mint-soft": "#E4F2EB",
        coral: "#E06B52",
        "coral-soft": "#FBE7E1",
        gold: "#C9A227",
        blue: "#3E6E8E",
        lilac: "#7C6CA8",
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
