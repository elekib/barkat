import type { Config } from "tailwindcss";

// Colours are the CSS custom properties in globals.css, so one class works in
// light and dark (the tokens swap, utilities do not need `dark:` variants).
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        ink: "var(--ink)",
        ink2: "var(--ink-2)",
        muted: "var(--muted)",
        line: "var(--line)",
        axis: "var(--axis)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        good: "var(--good)",
        bad: "var(--bad)",
        "good-bright": "var(--good-bright)",
        "bad-bright": "var(--bad-bright)",
        series1: "var(--series-1)",
        series2: "var(--series-2)",
        paid: "var(--st-paid)",
        made: "var(--st-made)",
        pending: "var(--st-pending)",
        none: "var(--st-none)",
      },
      boxShadow: { card: "var(--shadow)" },
      fontFamily: { sans: ['system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'] },
    },
  },
  plugins: [],
};

export default config;
